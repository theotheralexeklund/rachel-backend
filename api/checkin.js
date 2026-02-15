import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function getCentralParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  const map = {};
  parts.forEach(({ type, value }) => {
    if (type !== "literal") map[type] = value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function getDeadline(checkpoint) {
  return {
    morning: { hour: 9, minute: 0 },
    afternoon: { hour: 14, minute: 0 },
    evening: { hour: 22, minute: 0 }
  }[checkpoint];
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { checkpoint } = req.body || {};
  if (!["morning", "afternoon", "evening"].includes(checkpoint))
    return res.status(400).json({ error: "Invalid checkpoint" });

  const parts = getCentralParts();
  const today = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

  const { data: state, error } = await supabase
    .from("rachel_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  let updatedState = { ...state };

  // Handle day rollover
  if (state.active_date !== today) {
    updatedState.morning_completed = false;
    updatedState.afternoon_completed = false;
    updatedState.evening_completed = false;
    updatedState.probation_active = false;
    updatedState.active_date = today;
  }

  // Deadline calculation
  const deadline = getDeadline(checkpoint);
  const minutesLate =
  parts.hour * 60 +
  parts.minute -
  (deadline.hour * 60 + deadline.minute);

const GRACE_MINUTES = 15;
const isLate = minutesLate > 0;
const effectiveLate = minutesLate > GRACE_MINUTES;

let violationTriggered = null;

if (effectiveLate) {
  if (!updatedState.probation_active) {
    updatedState.probation_active = true;
    violationTriggered = "warning";
  } else {
    updatedState.current_streak = 0;
    updatedState.probation_active = false;
    violationTriggered = "reset";
  }
}

  // Mark checkpoint completed
  updatedState[`${checkpoint}_completed`] = true;

  // Check full day completion
  const dayComplete =
    updatedState.morning_completed &&
    updatedState.afternoon_completed &&
    updatedState.evening_completed;

  if (dayComplete && violationTriggered !== "reset") {
    updatedState.current_streak += 1;
    if (updatedState.current_streak > updatedState.longest_streak) {
      updatedState.longest_streak = updatedState.current_streak;
    }
  }

  await supabase
    .from("rachel_state")
    .update(updatedState)
    .eq("id", 1);

  return res.status(200).json({
    checkpoint,
    is_late: isLate,
    within_grace: isLate && !effectiveLate,
    minutes_late: Math.max(0, minutesLate),
    violation: violationTriggered,
    current_streak: updatedState.current_streak,
    probation_active: updatedState.probation_active,
    day_complete: dayComplete
  });
}
