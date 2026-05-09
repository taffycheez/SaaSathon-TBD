export default function ScorePanel({ score, breakdown, advice = [], isPreviewing = false }) {
  const segmentCount = 10;
  const activeSegments = Math.max(0, Math.min(segmentCount, Math.round(score / 10)));

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
        {Array.from({ length: segmentCount }).map((_, index) => (
          <span
            key={`segment-${index}`}
            className={index < activeSegments ? "active" : ""}
          />
        ))}
      </div>

      <ul className="score-list">
        {breakdown.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>

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
    </div>
  );
}
