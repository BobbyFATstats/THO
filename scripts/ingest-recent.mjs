import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic();

const TEAM_MEMBERS = ["Bobby", "Karla", "Tammy"];
const CATEGORIES = ["crm_feature", "crm_bug", "idea", "growth_learning", "deal_update", "general"];
const PRIORITIES = ["high", "medium", "low"];

const EXTRACTION_TOOL = {
  name: "save_meeting_extraction",
  description: "Save the structured extraction from a meeting transcript.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "2-3 sentence meeting overview" },
      action_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string", nullable: true },
            assignee: { type: "string", nullable: true, enum: [...TEAM_MEMBERS] },
            priority: { type: "string", enum: [...PRIORITIES] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["title", "priority", "confidence"],
        },
      },
      discussion_topics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: [...CATEGORIES] },
            title: { type: "string" },
            summary: { type: "string", nullable: true },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["category", "title", "confidence"],
        },
      },
    },
    required: ["summary", "action_items", "discussion_topics"],
  },
};

const SYSTEM_PROMPT = `You are an AI assistant that extracts structured data from meeting transcripts for the Total House Offer (THO) wholesale real estate team.

Extract:
1. A 2-3 sentence meeting summary
2. Action items — tasks someone needs to do
3. Discussion topics — categorized subjects discussed

RULES:
- Only extract items EXPLICITLY discussed. Do not infer.
- Assignees must be: ${TEAM_MEMBERS.join(", ")}. If unclear, set to null.
- Confidence: 1.0 = explicit, 0.7-0.9 = some ambiguity, 0.5-0.7 = implied, <0.5 = guessing
- Categories: crm_feature, crm_bug, idea, growth_learning, deal_update, general

Call the save_meeting_extraction tool with your findings.`;

async function getZoomToken() {
  const creds = Buffer.from(process.env.ZOOM_CLIENT_ID + ':' + process.env.ZOOM_CLIENT_SECRET).toString('base64');
  const res = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'account_credentials', account_id: process.env.ZOOM_ACCOUNT_ID }),
  });
  const data = await res.json();
  return data.access_token;
}

async function main() {
  console.log('Getting Zoom access token...');
  const token = await getZoomToken();

  // Fetch last 30 days of recordings
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = new Date().toISOString().split('T')[0];

  const recRes = await fetch(`https://api.zoom.us/v2/users/me/recordings?from=${from}&to=${to}&page_size=50`, {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const recData = await recRes.json();

  // Filter for THO Stand-Ups with transcripts, take last 5
  const standups = recData.meetings
    .filter(m => m.topic.toLowerCase().includes('tho daily stand-up'))
    .filter(m => m.recording_files?.some(f => f.file_type === 'TRANSCRIPT'))
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, 5);

  console.log(`\nFound ${standups.length} meetings to process:\n`);
  standups.forEach(m => console.log(`  ${m.start_time.split('T')[0]} - ${m.topic} (UUID: ${m.uuid})`));

  for (const meeting of standups) {
    const date = meeting.start_time.split('T')[0];
    const zoomId = meeting.uuid; // Use UUID for uniqueness (recurring meetings share the same ID)

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${date} - ${meeting.topic}`);

    // Idempotency check
    const { data: existing } = await supabase
      .from('meetings')
      .select('id')
      .eq('zoom_meeting_id', zoomId)
      .single();

    if (existing) {
      console.log('  Already processed, skipping.');
      continue;
    }

    // Find transcript file
    const transcriptFile = meeting.recording_files.find(f => f.file_type === 'TRANSCRIPT' && f.status === 'completed');
    if (!transcriptFile) {
      console.log('  No completed transcript found, skipping.');
      continue;
    }

    // Download transcript
    console.log('  Downloading transcript...');
    const transcriptRes = await fetch(transcriptFile.download_url + '?access_token=' + token);
    const transcript = await transcriptRes.text();
    console.log(`  Transcript length: ${transcript.length} chars`);

    // Insert meeting row
    const { data: meetingRow, error: insertErr } = await supabase
      .from('meetings')
      .insert({ zoom_meeting_id: zoomId, date, raw_transcript: transcript })
      .select()
      .single();

    if (insertErr) {
      console.log('  Insert error:', insertErr.message);
      continue;
    }
    console.log('  Meeting row created:', meetingRow.id);

    // Extract with Claude
    console.log('  Running Claude extraction...');
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        messages: [{
          role: 'user',
          content: `Here is the transcript from the THO Daily Stand-Up on ${date}. Extract all action items, discussion topics, and provide a summary.\n\n${transcript}`,
        }],
      });

      const toolUse = response.content.find(b => b.type === 'tool_use');
      if (!toolUse) {
        console.log('  No tool_use in response, skipping extraction.');
        continue;
      }

      const extraction = toolUse.input;

      // Validate
      for (const item of extraction.action_items) {
        item.confidence = Math.max(0, Math.min(1, item.confidence));
        if (item.assignee && !TEAM_MEMBERS.includes(item.assignee)) item.assignee = null;
      }
      for (const topic of extraction.discussion_topics) {
        topic.confidence = Math.max(0, Math.min(1, topic.confidence));
      }

      console.log(`  Extracted: ${extraction.action_items.length} action items, ${extraction.discussion_topics.length} topics`);
      console.log(`  Summary: ${extraction.summary.substring(0, 100)}...`);

      // Insert action items
      if (extraction.action_items.length > 0) {
        const { error } = await supabase.from('action_items').insert(
          extraction.action_items.map((item, idx) => ({
            meeting_id: meetingRow.id,
            title: item.title,
            description: item.description || null,
            assignee: item.assignee || null,
            priority: item.priority,
            confidence_score: item.confidence,
            source: 'ai_extracted',
            sort_order: idx,
          }))
        );
        if (error) console.log('  Action items insert error:', error.message);
      }

      // Insert discussion topics
      if (extraction.discussion_topics.length > 0) {
        const { error } = await supabase.from('discussion_topics').insert(
          extraction.discussion_topics.map(topic => ({
            meeting_id: meetingRow.id,
            category: topic.category,
            title: topic.title,
            summary: topic.summary || null,
            confidence_score: topic.confidence,
          }))
        );
        if (error) console.log('  Topics insert error:', error.message);
      }

      // Update meeting with summary
      await supabase.from('meetings').update({
        ai_summary: extraction.summary,
        processed_at: new Date().toISOString(),
      }).eq('id', meetingRow.id);

      console.log('  Done!');

    } catch (err) {
      console.log('  Claude error:', err.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Ingestion complete!');

  // Show summary
  const { data: meetings } = await supabase.from('meetings').select('id, date, ai_summary').order('date', { ascending: false });
  const { data: items } = await supabase.from('action_items').select('id');
  const { data: topics } = await supabase.from('discussion_topics').select('id');

  console.log(`\nDatabase now has:`);
  console.log(`  ${meetings?.length || 0} meetings`);
  console.log(`  ${items?.length || 0} action items`);
  console.log(`  ${topics?.length || 0} discussion topics`);
}

main().catch(console.error);
