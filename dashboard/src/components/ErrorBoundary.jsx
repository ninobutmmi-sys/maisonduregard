import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          fontFamily: 'Montserrat, sans-serif',
          color: '#3D2C2E',
          background: '#FFF5F0',
        }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', marginBottom: '1rem' }}>
            Oups, une erreur est survenue
          </h1>
          <p style={{ color: '#6B5558', marginBottom: '1.5rem' }}>
            {this.state.error?.message || 'Erreur inattendue'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 2rem',
              background: 'linear-gradient(135deg, #ff9a9e 0%, #fcb69f 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 600,
              fontSize: '0.95rem',
            }}
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
