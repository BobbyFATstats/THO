import Anthropic from "@anthropic-ai/sdk";
import { TEAM_MEMBERS, CATEGORIES, PRIORITIES } from "./constants";
import type { ExtractionResult } from "./types";

const client = new Anthropic();

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "save_meeting_extraction",
  description:
    "Save the structured extraction from a meeting transcript including summary, action items, and discussion topics.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description: "2-3 sentence overview of what was discussed in the meeting",
      },
      action_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Short description of the action item",
            },
            description: {
              type: "string",
              nullable: true,
              description: "Detailed context about the action item",
            },
            assignee: {
              type: "string",
              nullable: true,
              enum: [...TEAM_MEMBERS],
              description: "Team member assigned. Must be one of the team members or null if unclear.",
            },
            priority: {
              type: "string",
              enum: [...PRIORITIES],
              description: "Priority level based on urgency discussed",
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description:
                "How confident you are this is a real action item. 1.0 = explicitly stated, 0.5 = implied, <0.5 = guessing",
            },
          },
          required: ["title", "priority", "confidence"],
        },
      },
      discussion_topics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [...CATEGORIES],
              description: "Category of the discussion topic",
            },
            title: {
              type: "string",
              description: "Short title for the topic",
            },
            summary: {
              type: "string",
              nullable: true,
              description: "Brief summary of what was discussed",
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description:
                "How confident you are this topic was substantively discussed. 1.0 = clearly discussed, <0.5 = briefly mentioned",
            },
          },
          required: ["category", "title", "confidence"],
        },
      },
    },
    required: ["summary", "action_items", "discussion_topics"],
  },
};

const SYSTEM_PROMPT = `You are an AI assistant that extracts structured data from meeting transcripts for the Total House Offer (THO) wholesale real estate team.

Your job is to analyze the transcript and extract:
1. A 2-3 sentence meeting summary
2. Action items — tasks someone needs to do
3. Discussion topics — categorized subjects that were discussed

RULES:
- Only extract items that were EXPLICITLY discussed in the meeting. Do not infer from background context.
- For assignees, only use these team member names: ${TEAM_MEMBERS.join(", ")}. If the assignee is unclear, set it to null.
- Confidence scoring:
  - 1.0 = clearly and explicitly stated ("Bobby, call the seller today")
  - 0.7-0.9 = stated but with some ambiguity
  - 0.5-0.7 = implied but not directly stated
  - <0.5 = you're guessing this might be worth tracking
- For discussion topic categories:
  - crm_feature: Feature requests or improvements for their CRM (GoHighLevel)
  - crm_bug: Bugs or issues with their CRM
  - idea: New business ideas or process improvements
  - growth_learning: Learning opportunities, training, skill development
  - deal_update: Updates on specific real estate deals/properties
  - general: Anything else worth noting

Call the save_meeting_extraction tool with your findings.`;

export async function extractMeetingData(
  transcript: string
): Promise<ExtractionResult> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    messages: [
      {
        role: "user",
        content: `Here is the transcript from today's THO Daily Stand-Up meeting. Please extract all action items, discussion topics, and provide a summary.\n\n${transcript}`,
      },
    ],
  });

  // Find the tool use block
  const toolUse = response.content.find(
    (block) => block.type === "tool_use"
  );

  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use response");
  }

  const input = toolUse.input as ExtractionResult;

  // Ensure arrays exist even if Claude omits them
  if (!Array.isArray(input.action_items)) input.action_items = [];
  if (!Array.isArray(input.discussion_topics)) input.discussion_topics = [];

  // Validate and clamp confidence scores
  for (const item of input.action_items) {
    item.confidence = Math.max(0, Math.min(1, item.confidence));
    if (item.assignee && !TEAM_MEMBERS.includes(item.assignee as typeof TEAM_MEMBERS[number])) {
      item.assignee = null;
    }
  }

  for (const topic of input.discussion_topics) {
    topic.confidence = Math.max(0, Math.min(1, topic.confidence));
  }

  return input;
}
