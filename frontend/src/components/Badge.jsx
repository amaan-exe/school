const Badge = ({ variant = 'neutral', children }) => (
  <span className={`badge badge-${variant}`}>{children}</span>
)

export default Badge
