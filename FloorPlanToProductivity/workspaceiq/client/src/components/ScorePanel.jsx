export default function ScorePanel({ score, breakdown }) {
  const tone = score >= 75 ? "good" : score >= 45 ? "medium" : "low";

  return (
    <div className="panel-card score-card">
      <div className="score-topline">
        <div>
          <p className="upload-kicker">Live score</p>
          <h2>Productivity score</h2>
        </div>
        <div className={`score-badge ${tone}`}>{score}</div>
      </div>

      <ul className="score-list">
        {breakdown.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
