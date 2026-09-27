import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Cupping } from "./types";

export const tastingMetrics = [
  { key: "score", label: "Overall score", max: 100, min: 0 },
  { key: "aroma", label: "Aroma", max: 10, min: 0 },
  { key: "acidity", label: "Acidity", max: 10, min: 0 },
  { key: "sweetness", label: "Sweetness", max: 10, min: 0 },
  { key: "body", label: "Body", max: 10, min: 0 },
  { key: "finish", label: "Finish", max: 10, min: 0 },
  { key: "liking", label: "Personal liking", max: 5, min: 1 },
  { key: "targetMatch", label: "Match to intended cup", max: 5, min: 1 },
] as const;
type Voter = { id: string; name: string; scores: Record<string, string> };
const newVoter = (): Voter => ({
  id: crypto.randomUUID(),
  name: "",
  scores: {},
});

export function MultiTastingFields() {
  const [voters, setVoters] = useState<Voter[]>(() => [newVoter()]);
  const update = (id: string, change: Partial<Voter>) =>
    setVoters((current) =>
      current.map((v) => (v.id === id ? { ...v, ...change } : v)),
    );
  return (
    <section className="multi-tasting wide" aria-label="Taster votes">
      <div className="voter-heading">
        <div>
          <span className="eyebrow">Around the table</span>
          <h3>
            {voters.length} {voters.length === 1 ? "taster" : "tasters"}
          </h3>
        </div>
        <button
          type="button"
          className="button"
          disabled={voters.length >= 20}
          onClick={() => setVoters([...voters, newVoter()])}
        >
          <Plus size={16} /> Add taster
        </button>
      </div>
      <div className="voter-names">
        {voters.map((v, index) => (
          <div className="voter-name" key={v.id}>
            <input type="hidden" name="voteId" value={v.id} />
            <label>
              <span>Taster {index + 1}</span>
              <input
                name={`taster_${v.id}`}
                value={v.name}
                maxLength={200}
                required
                placeholder="Name"
                onChange={(e) => update(v.id, { name: e.target.value })}
              />
            </label>
            {voters.length > 1 && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${v.name || `taster ${index + 1}`}`}
                onClick={() =>
                  setVoters(voters.filter((other) => other.id !== v.id))
                }
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="form-note">
        Each person gets a vote for every grade. Averages include only filled
        scores; leave anything unassessed blank.
      </p>
      <div className="vote-metrics">
        {tastingMetrics.map(({ key, label, min, max }) => {
          const values = voters
            .map((v) => v.scores[key] ?? "")
            .filter((v) => v.trim() !== "")
            .map(Number)
            .filter((v) => Number.isFinite(v) && v >= min && v <= max);
          const avg = values.length
            ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
            : "—";
          return (
            <fieldset className="vote-metric" key={key}>
              <legend>
                {label} <span>/ {max}</span>
              </legend>
              <div className="vote-average">
                <span>Average</span>
                <output aria-label={`${label} average`}>{avg}</output>
                <small>
                  {values.length} / {voters.length} voted
                </small>
              </div>
              <div className="vote-inputs">
                {voters.map((v, index) => (
                  <label key={v.id}>
                    <span>{v.name || `Taster ${index + 1}`}</span>
                    <input
                      aria-label={`${label} — ${v.name || `Taster ${index + 1}`}`}
                      name={`${key}_${v.id}`}
                      type="number"
                      min={min}
                      max={max}
                      step="any"
                      placeholder="—"
                      value={v.scores[key] ?? ""}
                      onChange={(e) =>
                        update(v.id, {
                          scores: { ...v.scores, [key]: e.target.value },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

export function TastingVotes({ cup }: { cup: Cupping }) {
  if (!cup.votes?.length) return null;
  return (
    <details className="tasting-votes">
      <summary>
        {cup.votes.length}{" "}
        {cup.votes.length === 1
          ? "taster’s scores"
          : "tasters · view individual votes"}
      </summary>
      <div
        className="vote-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Individual tasting scores"
      >
        <table>
          <caption>
            Individual votes · blank scores excluded from averages
          </caption>
          <thead>
            <tr>
              <th scope="col">Grade</th>
              {cup.votes.map((v) => (
                <th scope="col" key={v.taster}>
                  {v.taster}
                </th>
              ))}
              <th scope="col">Average</th>
            </tr>
          </thead>
          <tbody>
            {tastingMetrics.map(({ key, label, max }) => (
              <tr key={key}>
                <th scope="row">
                  {label} / {max}
                </th>
                {cup.votes!.map((v) => (
                  <td key={v.taster}>{v[key] ?? "—"}</td>
                ))}
                <td>{cup[key]?.toFixed(2) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
