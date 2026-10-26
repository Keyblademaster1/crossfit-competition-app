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
  { id: "ROWER", label: "Rower" },
  { id: "BIKE", label: "Bike" },
  { id: "SKI_ERG", label: "Ski erg" },
  { id: "RUN", label: "Running" },
  { id: "JUMP_ROPE", label: "Rope" },
  { id: "PULL_UP_BAR", label: "Pull-up bar" },
] as const;

export type ImplementId = (typeof IMPLEMENTS)[number]["id"];

/**
 * Whether a movement needs nothing put out in its lane: no equipment, or a
 * run, which happens outside the lanes.
 */
export function nothingToPutOut(implement: string): boolean {
  return implement === "OTHER" || implement === "RUN";
}

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
        {/* A long bar running the whole width, with its ends showing past
            the plates. The length is what tells it from a dumbbell, whose
            handle is short and whose heads are at its very ends. */}
        <rect x="0.4" y="12" width="25.2" height="2" rx="1" />
        <rect x="3.4" y="9.4" width="2" height="7.2" rx="0.8" />
        <rect x="5.6" y="7" width="2.8" height="12" rx="1" />
        <rect x="17.6" y="7" width="2.8" height="12" rx="1" />
        <rect x="20.6" y="9.4" width="2" height="7.2" rx="0.8" />
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
        {/* A gym rower from the side, as a Concept2 is built: the round
            flywheel housing at the front with the monitor on its arm above,
            the footplates, and the long rail running back with the seat on
            it. The long rail is what nothing else in the gym has. */}
        <circle cx="5.6" cy="15.4" r="4.8" />
        <path d="M6.6 10.8 8.2 5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="6.6" y="2.2" width="4.4" height="3.4" rx="0.8" />
        <rect x="9.4" y="9.6" width="2.4" height="5.8" rx="1" transform="rotate(-18 10.6 12.5)" />
        <path d="M9 16.4 25 19.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="15" y="14" width="5.4" height="2.4" rx="1.2" transform="rotate(11 17.7 15.2)" />
        <rect x="1" y="20.8" width="9.4" height="2.2" rx="1.1" />
        <rect x="22.6" y="19.6" width="2.4" height="3.4" rx="1" />
      </svg>
    );
  }

  if (kind === "BIKE") {
    return (
      <svg {...common}>
        {/* An air bike from the side: the big fan wheel at the front, the
            frame back to the seat, and the handle reaching up. The fan is
            what tells it from a rower, whose wheel sits low on a long rail. */}
        <circle cx="7.5" cy="16" r="5.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="7.5" cy="16" r="1.6" />
        <path
          d="M7.5 16 15.5 12.5 20 22.5M16 12.4l1-2.6M7.5 16 10 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <rect x="14.5" y="7.6" width="7.5" height="2.6" rx="1.3" />
        <rect x="7.4" y="3.2" width="5.4" height="2.4" rx="1.2" />
        <rect x="3" y="22.4" width="20" height="2.2" rx="1.1" />
      </svg>
    );
  }

  if (kind === "SKI_ERG") {
    return (
      <svg {...common}>
        {/* The tall tower standing on its foot, with a cord running down from
            the top to a handle on each side: pulled from above, unlike
            anything else in the gym. */}
        <rect x="10.8" y="3" width="4.4" height="20" rx="1.4" />
        <rect x="6" y="22.2" width="14" height="2.4" rx="1.2" />
        <path d="M11.6 5 6 12.6M14.4 5 20 12.6" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3.8" y="12" width="3.6" height="5.6" rx="1.8" />
        <rect x="18.6" y="12" width="3.6" height="5.6" rx="1.8" />
      </svg>
    );
  }

  if (kind === "RUN") {
    return (
      <svg {...common}>
        {/* A running figure in full stride, arms swinging against the legs,
            as on a track sign. */}
        <circle cx="16" cy="3.8" r="2.6" />
        <path
          d="M14.6 7.6 12 14.2M14.4 8.6l3.6 2.2 2.6-2.4M14 8.6l-3.8 1.8-2.4 2.6M12 14.2l4 3.4-1 5.4M12 14.2l-3 4.2-5 .8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
      return "rower";
    case "BIKE":
      return "bike";
    case "SKI_ERG":
      return "ski erg";
    case "RUN":
      return "run";
    case "JUMP_ROPE":
      return "rope";
    case "PULL_UP_BAR":
      return "bar";
    default:
      return "load";
  }
}
