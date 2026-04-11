import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Search terms
const DEAL_TERMS = /miami/i;
const PEOPLE_TERMS = /tammy|karla|carla/i;
const BUYER_TERMS = /colin|calin/i;

// Only care about meetings from roughly early March onward
const CUTOFF_DATE = '2026-03-01';

async function main() {
  // --- 1. Pull all meetings since cutoff with raw transcripts ---
  const { data: meetings, error: meetErr } = await supabase
    .from('meetings')
    .select('id, date, ai_summary, raw_transcript')
    .gte('date', CUTOFF_DATE)
    .order('date', { ascending: true });

  if (meetErr) { console.error('meetings query error:', meetErr.message); process.exit(1); }

  console.log(`\nLoaded ${meetings.length} meetings since ${CUTOFF_DATE}\n`);

  // --- 2. Pull all action items assigned to Karla or Tammy ---
  const { data: allActions } = await supabase
    .from('action_items')
    .select('id, meeting_id, title, description, assignee, priority, status, confidence_score, created_at')
    .or('assignee.ilike.%karla%,assignee.ilike.%tammy%,assignee.ilike.%carla%');

  // --- 3. Pull all discussion topics ---
  const { data: allTopics } = await supabase
    .from('discussion_topics')
    .select('id, meeting_id, category, title, summary, confidence_score, created_at');

  // --- 4. Pull all notes ---
  const { data: allNotes } = await supabase
    .from('notes')
    .select('id, meeting_id, content, author, created_at');

  // Build meeting lookup
  const meetingDateMap = Object.fromEntries(meetings.map(m => [m.id, m.date]));

  // ============================================================
  // REPORT
  // ============================================================

  const sep = '='.repeat(80);
  const thinSep = '-'.repeat(80);

  console.log(sep);
  console.log('  MIAMI DEAL — TAMMY & KARLA INVOLVEMENT REPORT');
  console.log('  Generated:', new Date().toISOString().split('T')[0]);
  console.log(sep);

  // --- A. Transcript deep-search: find every Miami mention in raw VTT ---
  console.log('\n\n' + sep);
  console.log('  SECTION 1: RAW TRANSCRIPT MENTIONS OF "MIAMI"');
  console.log(sep);

  let transcriptHits = 0;

  for (const m of meetings) {
    if (!m.raw_transcript) continue;

    const lines = m.raw_transcript.split('\n');
    const miamiLines = [];

    for (let i = 0; i < lines.length; i++) {
      if (DEAL_TERMS.test(lines[i])) {
        // Grab surrounding context (5 lines before and after)
        const start = Math.max(0, i - 5);
        const end = Math.min(lines.length - 1, i + 5);
        const snippet = lines.slice(start, end + 1).join('\n');
        miamiLines.push({ lineNum: i + 1, snippet });
      }
    }

    if (miamiLines.length > 0) {
      transcriptHits++;
      console.log(`\n${thinSep}`);
      console.log(`MEETING DATE: ${m.date}`);
      console.log(`AI SUMMARY: ${m.ai_summary || '(none)'}`);
      console.log(`MIAMI MENTIONS: ${miamiLines.length}`);
      console.log(thinSep);

      for (const hit of miamiLines) {
        console.log(`\n  [Line ${hit.lineNum}]`);
        console.log(hit.snippet.split('\n').map(l => '    ' + l).join('\n'));
      }
    }
  }

  if (transcriptHits === 0) {
    console.log('\n  (No raw transcript mentions of "Miami" found.)');
  }

  // --- B. Transcript mentions where Tammy/Karla speak near Miami context ---
  console.log('\n\n' + sep);
  console.log('  SECTION 2: TAMMY/KARLA SPEAKING NEAR MIAMI MENTIONS');
  console.log(sep);

  let comboHits = 0;

  for (const m of meetings) {
    if (!m.raw_transcript) continue;

    const lines = m.raw_transcript.split('\n');
    const relevantBlocks = [];

    for (let i = 0; i < lines.length; i++) {
      // Look for lines where Miami appears AND Tammy/Karla/Carla is nearby
      if (DEAL_TERMS.test(lines[i])) {
        const windowStart = Math.max(0, i - 10);
        const windowEnd = Math.min(lines.length - 1, i + 10);
        const window = lines.slice(windowStart, windowEnd + 1).join('\n');

        if (PEOPLE_TERMS.test(window)) {
          relevantBlocks.push({
            lineNum: i + 1,
            block: lines.slice(windowStart, windowEnd + 1).join('\n'),
          });
        }
      }
    }

    if (relevantBlocks.length > 0) {
      comboHits++;
      console.log(`\n${thinSep}`);
      console.log(`MEETING DATE: ${m.date}`);
      console.log(`COMBINED HITS: ${relevantBlocks.length}`);
      console.log(thinSep);

      for (const hit of relevantBlocks) {
        console.log(`\n  [Around line ${hit.lineNum}]`);
        console.log(hit.block.split('\n').map(l => '    ' + l).join('\n'));
      }
    }
  }

  if (comboHits === 0) {
    console.log('\n  (No combined Tammy/Karla + Miami mentions found in transcripts.)');
  }

  // --- C. AI-extracted action items mentioning Miami, assigned to Karla/Tammy ---
  console.log('\n\n' + sep);
  console.log('  SECTION 3: ACTION ITEMS — KARLA/TAMMY (MIAMI-RELATED)');
  console.log(sep);

  const miamiActions = (allActions || []).filter(a =>
    DEAL_TERMS.test(a.title || '') || DEAL_TERMS.test(a.description || '')
  );

  const karlaOrTammyActions = (allActions || []).filter(a =>
    PEOPLE_TERMS.test(a.assignee || '')
  );

  if (miamiActions.length > 0) {
    console.log('\n  --- Miami-specific action items ---');
    for (const a of miamiActions) {
      const date = meetingDateMap[a.meeting_id] || a.created_at?.split('T')[0] || '?';
      console.log(`\n  [${date}] "${a.title}"`);
      console.log(`    Assignee: ${a.assignee || 'unassigned'} | Priority: ${a.priority} | Status: ${a.status}`);
      if (a.description) console.log(`    Description: ${a.description}`);
    }
  } else {
    console.log('\n  (No action items with "Miami" in title/description.)');
  }

  console.log('\n  --- ALL action items assigned to Karla/Tammy (full picture) ---');
  if (karlaOrTammyActions.length > 0) {
    for (const a of karlaOrTammyActions) {
      const date = meetingDateMap[a.meeting_id] || a.created_at?.split('T')[0] || '?';
      console.log(`\n  [${date}] "${a.title}"`);
      console.log(`    Assignee: ${a.assignee} | Priority: ${a.priority} | Status: ${a.status}`);
      if (a.description) console.log(`    Description: ${a.description}`);
    }
  } else {
    console.log('  (No action items assigned to Karla or Tammy.)');
  }

  // --- D. Discussion topics mentioning Miami ---
  console.log('\n\n' + sep);
  console.log('  SECTION 4: DISCUSSION TOPICS — MIAMI MENTIONS');
  console.log(sep);

  const miamiTopics = (allTopics || []).filter(t =>
    DEAL_TERMS.test(t.title || '') || DEAL_TERMS.test(t.summary || '')
  );

  if (miamiTopics.length > 0) {
    for (const t of miamiTopics) {
      const date = meetingDateMap[t.meeting_id] || t.created_at?.split('T')[0] || '?';
      console.log(`\n  [${date}] [${t.category}] "${t.title}"`);
      if (t.summary) console.log(`    ${t.summary}`);
      console.log(`    Confidence: ${t.confidence_score}`);
    }
  } else {
    console.log('\n  (No discussion topics mentioning "Miami".)');
  }

  // --- E. Discussion topics mentioning Tammy/Karla ---
  console.log('\n\n' + sep);
  console.log('  SECTION 5: DISCUSSION TOPICS — TAMMY/KARLA MENTIONS');
  console.log(sep);

  const peopleTopics = (allTopics || []).filter(t =>
    PEOPLE_TERMS.test(t.title || '') || PEOPLE_TERMS.test(t.summary || '')
  );

  if (peopleTopics.length > 0) {
    for (const t of peopleTopics) {
      const date = meetingDateMap[t.meeting_id] || t.created_at?.split('T')[0] || '?';
      console.log(`\n  [${date}] [${t.category}] "${t.title}"`);
      if (t.summary) console.log(`    ${t.summary}`);
    }
  } else {
    console.log('\n  (No discussion topics mentioning Tammy/Karla.)');
  }

  // --- F. Colin/Calin buyer mentions ---
  console.log('\n\n' + sep);
  console.log('  SECTION 6: BUYER "COLIN/CALIN" MENTIONS IN TRANSCRIPTS');
  console.log(sep);

  let buyerHits = 0;

  for (const m of meetings) {
    if (!m.raw_transcript) continue;

    const lines = m.raw_transcript.split('\n');
    const buyerLines = [];

    for (let i = 0; i < lines.length; i++) {
      if (BUYER_TERMS.test(lines[i])) {
        const start = Math.max(0, i - 5);
        const end = Math.min(lines.length - 1, i + 5);
        buyerLines.push({
          lineNum: i + 1,
          snippet: lines.slice(start, end + 1).join('\n'),
        });
      }
    }

    if (buyerLines.length > 0) {
      buyerHits++;
      console.log(`\n${thinSep}`);
      console.log(`MEETING DATE: ${m.date}`);
      console.log(`COLIN/CALIN MENTIONS: ${buyerLines.length}`);
      console.log(thinSep);

      for (const hit of buyerLines) {
        console.log(`\n  [Line ${hit.lineNum}]`);
        console.log(hit.snippet.split('\n').map(l => '    ' + l).join('\n'));
      }
    }
  }

  if (buyerHits === 0) {
    console.log('\n  (No mentions of "Colin"/"Calin" found in transcripts.)');
  }

  // --- G. Notes mentioning Miami or Tammy/Karla ---
  console.log('\n\n' + sep);
  console.log('  SECTION 7: NOTES — MIAMI / TAMMY / KARLA');
  console.log(sep);

  const relevantNotes = (allNotes || []).filter(n =>
    DEAL_TERMS.test(n.content || '') || PEOPLE_TERMS.test(n.content || '') || BUYER_TERMS.test(n.content || '')
  );

  if (relevantNotes.length > 0) {
    for (const n of relevantNotes) {
      const date = meetingDateMap[n.meeting_id] || n.created_at?.split('T')[0] || '?';
      console.log(`\n  [${date}] Author: ${n.author || '?'}`);
      console.log(`    ${n.content}`);
    }
  } else {
    console.log('\n  (No notes mentioning Miami, Tammy, Karla, or Colin/Calin.)');
  }

  // --- H. AI Summaries mentioning Miami ---
  console.log('\n\n' + sep);
  console.log('  SECTION 8: MEETING SUMMARIES MENTIONING MIAMI');
  console.log(sep);

  const miamiSummaries = meetings.filter(m =>
    DEAL_TERMS.test(m.ai_summary || '')
  );

  if (miamiSummaries.length > 0) {
    for (const m of miamiSummaries) {
      console.log(`\n  [${m.date}] ${m.ai_summary}`);
    }
  } else {
    console.log('\n  (No AI summaries mention "Miami".)');
  }

  // --- Summary stats ---
  console.log('\n\n' + sep);
  console.log('  SUMMARY');
  console.log(sep);
  console.log(`  Meetings searched: ${meetings.length} (since ${CUTOFF_DATE})`);
  console.log(`  Meetings with "Miami" in transcript: ${transcriptHits}`);
  console.log(`  Meetings with Tammy/Karla near Miami: ${comboHits}`);
  console.log(`  Meetings with "Miami" in AI summary: ${miamiSummaries.length}`);
  console.log(`  Action items mentioning Miami: ${miamiActions.length}`);
  console.log(`  Action items assigned to Karla/Tammy: ${karlaOrTammyActions.length}`);
  console.log(`  Discussion topics mentioning Miami: ${miamiTopics.length}`);
  console.log(`  Discussion topics mentioning Tammy/Karla: ${peopleTopics.length}`);
  console.log(`  Colin/Calin transcript mentions: ${buyerHits}`);
  console.log(`  Relevant notes: ${relevantNotes.length}`);
  console.log('\n' + sep);
  console.log('  TIP: Pipe output to a file for easier review:');
  console.log('  node scripts/search-miami-deal.mjs > miami-report.txt');
  console.log(sep + '\n');
}

main().catch(console.error);
