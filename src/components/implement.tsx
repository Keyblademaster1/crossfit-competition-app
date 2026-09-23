/**
 * Each piece of equipment, drawn as itself.
 *
 * A lane is read in a hurry — by whoever is setting the floor up between
 * heats, and by athletes standing over it. A kettlebell and a sandbag are very
 * different things to go and fetch, so they are not both a grey rectangle with
 * a number on it. The shape says what to pick up; the number says how heavy.
 *
 * Everything is drawn in `currentColor`, so the same shapes work on the dark
 * big screen and on the light admin screens.
 */

/**
 * Every kind of equipment, in the order the event builder offers them.
 *
 * One list, used both to fill the picker and to check what comes back from
 * the form, so the two cannot drift apart. "Nothing" comes first and is what
 * a new movement starts as: nothing is fetched for it until someone says so.
 */
export const IMPLEMENTS = [
  { id: "OTHER", label: "–" },
  { id: "BARBELL", label: "Barbell" },
  { id: "DUMBBELL", label: "Dumbbell" },
  { id: "KETTLEBELL", label: "Kettlebell" },
  { id: "SANDBAG", label: "Sandbag" },
  { id: "WALL_BALL", label: "Wall ball" },
  { id: "BOX", label: "Box" },
  { id: "ROWER", label: "Rower / bike" },
  { id: "JUMP_ROPE", label: "Rope" },
  { id: "PULL_UP_BAR", label: "Pull-up bar" },
] as const;

export type ImplementId = (typeof IMPLEMENTS)[number]["id"];

export function ImplementShape({
  kind,
  size = 26,
}: {
  kind: string;
  /** Drawn square, at whatever size the screen around it is working in. */
  size?: number | string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 26 26",
    fill: "currentColor",
    "aria-hidden": true,
  } as const;

  if (kind === "KETTLEBELL") {
    return (
      <svg {...common}>
        {/* The handle, and the bell hanging under it. The bell is drawn as a
            circle: a flat bottom made it too close to the sandbag, and round
            against square is the difference you can see across a gym. */}
        <path
          d="M9 11.2V8.6a4 4 0 0 1 8 0v2.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="13" cy="16.4" r="6.3" />
      </svg>
    );
  }

  if (kind === "DUMBBELL") {
    return (
      <svg {...common}>
        {/* A head at each end with a short handle between them. */}
        <rect x="1.5" y="8" width="4" height="10" rx="1.3" />
        <rect x="6" y="6" width="4" height="14" rx="1.3" />
        <rect x="10" y="11.5" width="6" height="3" />
        <rect x="16" y="6" width="4" height="14" rx="1.3" />
        <rect x="20.5" y="8" width="4" height="10" rx="1.3" />
      </svg>
    );
  }

  if (kind === "SANDBAG") {
    return (
      <svg {...common}>
        {/* The cinched top, and the bag squared off under it — the opposite
            shape to the kettlebell, so the two are told apart at a glance.
            It keeps its straight sides against the box, which tapers. */}
        <rect x="4.6" y="5.8" width="16.8" height="3" rx="1.1" />
        <rect x="2.8" y="9.8" width="20.4" height="10.6" rx="2" />
      </svg>
    );
  }

  if (kind === "BARBELL") {
    return (
      <svg {...common}>
        {/* Plates at both ends of a bar, heaviest inboard. */}
        <rect x="1" y="9.5" width="2.8" height="7" rx="1" />
        <rect x="4.8" y="6.5" width="3.6" height="13" rx="1.2" />
        <rect x="8.4" y="11.6" width="9.2" height="2.8" rx="1.2" />
        <rect x="17.6" y="6.5" width="3.6" height="13" rx="1.2" />
        <rect x="22.2" y="9.5" width="2.8" height="7" rx="1" />
      </svg>
    );
  }

  if (kind === "WALL_BALL") {
    return (
      <svg {...common}>
        {/* Two seams curving away from each other, which is what makes this
            read as a ball rather than as a dot or a plate. */}
        <circle cx="13" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2.3" />
        <path
          d="M8.6 6.2c3.4 3.6 3.4 10 0 13.6M17.4 6.2c-3.4 3.6-3.4 10 0 13.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (kind === "BOX") {
    return (
      <svg {...common}>
        {/* A plyo box, wider at the foot than at the top. */}
        <path d="M7.5 6.5h11l3.4 13a1 1 0 0 1-1 1.2H5.1a1 1 0 0 1-1-1.2l3.4-13Z" />
      </svg>
    );
  }

  if (kind === "ROWER") {
    return (
      <svg {...common}>
        {/* The spoked flywheel, the rail, and the seat sliding along it. A
            solid flywheel merged with the rail into one dumbbell-shaped
            blob at the size this is drawn on a TV. */}
        <circle cx="8" cy="10" r="5.4" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M8 5.4v9.2M3.4 10h9.2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="2" y="18" width="22" height="2.4" rx="1.2" />
        <rect x="14" y="14.4" width="6" height="2.6" rx="1.2" />
      </svg>
    );
  }

  if (kind === "JUMP_ROPE") {
    return (
      <svg {...common}>
        {/* The rope swung over, with a handle in each hand. Drawn as the
            whole loop rather than a dip: at the size this appears on a TV,
            a dip with two thin handles above it collapsed into a "U". */}
        <path
          d="M8 20.5c-4-2-6-5.5-6-9C2 6.5 6.9 2.5 13 2.5S24 6.5 24 11.5c0 3.5-2 7-6 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect x="5.6" y="18.6" width="4" height="6" rx="2" />
        <rect x="16.4" y="18.6" width="4" height="6" rx="2" />
      </svg>
    );
  }

  if (kind === "PULL_UP_BAR") {
    return (
      <svg {...common}>
        {/* The bar, and the uprights holding it up. */}
        <rect x="1.5" y="5.5" width="23" height="2.8" rx="1.4" />
        <rect x="3.6" y="8.3" width="2.6" height="12.2" rx="1" />
        <rect x="19.8" y="8.3" width="2.6" height="12.2" rx="1" />
      </svg>
    );
  }

  // OTHER: nothing to fetch, or nothing we have a name for. Drawing a shape
  // here would be a guess, and a wrong symbol is worse than none.
  return null;
}

/** What a movement's load is on, as it would be said out loud. */
export function implementNoun(implement: string): string {
  switch (implement) {
    case "BARBELL":
      return "bar";
    case "SANDBAG":
      return "bag";
    case "KETTLEBELL":
      return "kettlebell";
    case "DUMBBELL":
      return "dumbbell";
    case "WALL_BALL":
      return "ball";
    case "BOX":
      return "box";
    case "ROWER":
      return "machine";
    case "JUMP_ROPE":
      return "rope";
    case "PULL_UP_BAR":
      return "bar";
    default:
      return "load";
  }
}
