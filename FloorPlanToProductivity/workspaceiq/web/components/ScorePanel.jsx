export default function ScorePanel({
  score,
  breakdown,
  advice = [],
  zones = [],
  explanation = null,
  isPreviewing = false,
  isLoadingExplanation = false
}) {
  const boundedScore = Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <div className="panel-card score-card">
      <div className="score-topline">
        <div>
          <p className="upload-kicker">{isPreviewing ? "Live Feng Shui preview" : "Live Feng Shui score"}</p>
          <h2>Productivity score</h2>
        </div>
        <div className="score-badge">{score}</div>
      </div>
      <div className="score-meter" aria-hidden="true">
        <div className="score-meter-fill" style={{ width: `${boundedScore}%` }} />
      </div>

      <ul className="score-list">
        {breakdown.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>

      {zones.length ? (
        <div className="score-advice">
          <p className="upload-kicker">Detected zones</p>
          <p>
            {zones.length} zone(s): {zones.map((zone) => zone.label).join(", ")}.
          </p>
        </div>
      ) : null}

      {advice.length ? (
        <div className="score-advice">
          <p className="upload-kicker">How to improve</p>
          <ul className="score-advice-list">
            {advice.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {explanation ? (
        <div className="score-advice">
          <p className="upload-kicker">
            {explanation.source === "ai" ? "AI design read" : "Design read"}
          </p>
          <p>{explanation.summary}</p>
          {Array.isArray(explanation.insights) && explanation.insights.length ? (
            <ul className="score-advice-list">
              {explanation.insights.map((item, index) => (
                <li key={`insight-${index}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : isLoadingExplanation ? (
        <div className="score-advice">
          <p className="upload-kicker">AI design read</p>
          <p>Generating a short workspace explanation...</p>
        </div>
      ) : null}
    </div>
  );
}
