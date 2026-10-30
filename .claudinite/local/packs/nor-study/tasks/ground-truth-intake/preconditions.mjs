// The intake's gate: is any ground truth waiting? A submission is an open issue wearing the label the
// NoR Finder page puts on the issue it opens.
import { LABEL } from './label.mjs';

export const terms = {
  'ground-truth-submitted': {
    signals: ['issues'],
    holds(signals) {
      const waiting = (signals?.issues?.open ?? []).filter((i) => (i.labels ?? []).includes(LABEL));
      if (!waiting.length) return { holds: false, reason: `no open issue is labelled ${LABEL}` };
      return {
        holds: true,
        reason: `${waiting.length} open issue(s) labelled ${LABEL}`,
        context: [`Submissions waiting: ${waiting.map((i) => `#${i.number}`).join(', ')}.`],
      };
    },
  },
};
