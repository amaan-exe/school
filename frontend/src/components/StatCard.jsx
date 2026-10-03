// Metric figure: small-caps label, big Inter numeral, indigo rail on the left edge.
// Same props as before (icon/color/bg accepted but rendered quietly) so all
// existing call sites keep working unchanged.
const StatCard = ({ icon: Icon, label, value, sub, color, bg }) => (
  <div className="stat-card">
    <div className="stat-content">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  </div>
)

export default StatCard
