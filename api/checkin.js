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
  // Always set CORS headers first
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight safely
  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!req.body) {
    return res.status(400).json({ error: "Missing body" });
  }

  const { checkpoint } = req.body;

  if (!["morning", "afternoon", "evening"].includes(checkpoint)) {
    return res.status(400).json({ error: "Invalid checkpoint" });
  }

  const parts = getCentralParts();
  const today = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

  const { data: state, error } = await supabase
    .from("rachel_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  let updatedState = { ...state };

  // Initialize first use
  if (!state.active_date) {
    updatedState.active_date = today;
  }

  // Rollover enforcement
  else if (state.active_date !== today) {
    const previousDayComplete =
      state.morning_completed &&
      state.afternoon_completed &&
      state.evening_completed;

    if (!previousDayComplete) {
      if (!state.probation_active) {
        updatedState.probation_active = true;
      } else {
        updatedState.current_streak = 0;
        updatedState.probation_active = false;
      }
    }

    updatedState.morning_completed = false;
    updatedState.afternoon_completed = false;
    updatedState.evening_completed = false;
    updatedState.active_date = today;
  }

  const deadline = getDeadline(checkpoint);
  if (!deadline) {
    return res.status(400).json({ error: "Invalid deadline" });
  }

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

  updatedState[`${checkpoint}_completed`] = true;

  const dayComplete =
    updatedState.morning_completed &&
    updatedState.afternoon_completed &&
    updatedState.evening_completed;

  if (
    dayComplete &&
    violationTriggered !== "reset" &&
    updatedState.last_completed_date !== today
  ) {
    updatedState.current_streak += 1;

    if (updatedState.current_streak > updatedState.longest_streak) {
      updatedState.longest_streak = updatedState.current_streak;
    }

    updatedState.last_completed_date = today;
  }

  await supabase
    .from("rachel_state")
    .update(updatedState)
    .eq("id", 1);

  // Structured status
  let status = "on_time";
  let streakChange = "unchanged";
  let toneLevel = 1;

  if (violationTriggered === "warning") {
    status = "warning";
    toneLevel = 2;
  }

  if (violationTriggered === "reset") {
    status = "reset";
    toneLevel = 3;
    streakChange = "reset";
  }

  if (isLate && !effectiveLate) {
    status = "within_grace";
  }

  if (
    dayComplete &&
    violationTriggered !== "reset" &&
    updatedState.last_completed_date === today
  ) {
    status = "perfect_day";
    streakChange = "incremented";
  }

  return res.status(200).json({
    checkpoint,
    status,
    tone_level: toneLevel,
    streak_change: streakChange,
    current_streak: updatedState.current_streak,
    probation_active: updatedState.probation_active
  });
}
