/**
 * Two stacked five-step bars: side A in sage, side B in rose. Reading
 * them together shows at a glance where the two of you disagree.
 */
export function PriorityBars({
  priorityA,
  priorityB,
  nameA,
  nameB,
}: {
  priorityA: number;
  priorityB: number;
  nameA: string;
  nameB: string;
}) {
  return (
    <span
      className="inline-flex flex-col gap-[3px]"
      title={`${nameA} ${priorityA}/5 · ${nameB} ${priorityB}/5`}
    >
      <span className="sr-only">
        {nameA} rates this {priorityA} of 5, {nameB} rates it {priorityB} of 5
      </span>
      <Bar value={priorityA} filled="bg-sage-mid" />
      <Bar value={priorityB} filled="bg-rose-mid" />
    </span>
  );
}

function Bar({ value, filled }: { value: number; filled: string }) {
  return (
    <span aria-hidden className="flex gap-[2px]">
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={`h-[3px] w-[5px] rounded-[1px] ${step <= value ? filled : "bg-hairline"}`}
        />
      ))}
    </span>
  );
}
