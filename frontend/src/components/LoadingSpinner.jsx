const LoadingSpinner = ({ message = 'Loading…', small }) => (
  <div className="loading-container">
    <div className={`spinner ${small ? 'spinner-sm' : ''}`} />
    {message && <div className="loading-text">{message}</div>}
  </div>
)

export default LoadingSpinner
