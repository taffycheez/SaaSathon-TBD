export default function ScorePanel({ score, breakdown }) {
  const segmentCount = 10;
  const activeSegments = Math.max(0, Math.min(segmentCount, Math.round(score / 10)));

  return (
    <div className="panel-card score-card">
      <div className="score-topline">
        <div>
          <p className="upload-kicker">Live score</p>
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
        {breakdown.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
