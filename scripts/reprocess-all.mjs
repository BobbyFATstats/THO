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

async function main() {
  // Get unprocessed meetings
  const { data: meetings } = await supabase
    .from('meetings')
    .select('*')
    .is('processed_at', null)
    .not('raw_transcript', 'is', null)
    .order('date', { ascending: false });

  console.log(`Found ${meetings?.length || 0} unprocessed meetings\n`);

  for (const meeting of (meetings || [])) {
    console.log(`${'='.repeat(60)}`);
    console.log(`Processing: ${meeting.date} (${meeting.id})`);
    console.log(`  Transcript: ${meeting.raw_transcript.length} chars`);

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        messages: [{
          role: 'user',
          content: `Here is the transcript from the THO Daily Stand-Up on ${meeting.date}. Extract all action items, discussion topics, and provide a summary.\n\n${meeting.raw_transcript}`,
        }],
      });

      const toolUse = response.content.find(b => b.type === 'tool_use');
      if (!toolUse) {
        console.log('  No tool_use response');
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
      console.log(`  Summary: ${extraction.summary.substring(0, 120)}...`);

      // Insert action items
      if (extraction.action_items.length > 0) {
        await supabase.from('action_items').insert(
          extraction.action_items.map((item, idx) => ({
            meeting_id: meeting.id,
            title: item.title,
            description: item.description || null,
            assignee: item.assignee || null,
            priority: item.priority,
            confidence_score: item.confidence,
            source: 'ai_extracted',
            sort_order: idx,
          }))
        );
      }

      // Insert topics
      if (extraction.discussion_topics.length > 0) {
        await supabase.from('discussion_topics').insert(
          extraction.discussion_topics.map(topic => ({
            meeting_id: meeting.id,
            category: topic.category,
            title: topic.title,
            summary: topic.summary || null,
            confidence_score: topic.confidence,
          }))
        );
      }

      // Update meeting
      await supabase.from('meetings').update({
        ai_summary: extraction.summary,
        processed_at: new Date().toISOString(),
      }).eq('id', meeting.id);

      console.log('  Done!\n');
    } catch (err) {
      console.log('  Error:', err.message);
    }
  }

  // Final summary
  const { data: allMeetings } = await supabase.from('meetings').select('id').not('processed_at', 'is', null);
  const { data: allItems } = await supabase.from('action_items').select('id');
  const { data: allTopics } = await supabase.from('discussion_topics').select('id');

  console.log('='.repeat(60));
  console.log('DONE! Database summary:');
  console.log(`  ${allMeetings?.length || 0} processed meetings`);
  console.log(`  ${allItems?.length || 0} action items`);
  console.log(`  ${allTopics?.length || 0} discussion topics`);
}

main().catch(console.error);
