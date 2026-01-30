import React from 'react';
import './SkeletonLoader.css';

interface SkeletonLoaderProps {
  type?: 'table' | 'card' | 'list' | 'text' | 'custom';
  rows?: number;
  columns?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  type = 'text',
  rows = 1,
  columns = 1,
  className = '',
  style = {},
}) => {
  if (type === 'table') {
    const gridColumns = `repeat(${columns}, 1fr)`;
    return (
      <div className={`skeleton-table ${className}`} style={{ ...style, '--columns': columns } as React.CSSProperties}>
        <div className="skeleton-table-header" style={{ gridTemplateColumns: gridColumns }}>
          {Array.from({ length: columns }).map((_, idx) => (
            <div key={idx} className="skeleton-cell skeleton-header-cell" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="skeleton-table-row" style={{ gridTemplateColumns: gridColumns }}>
            {Array.from({ length: columns }).map((_, colIdx) => (
              <div key={colIdx} className="skeleton-cell" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={`skeleton-card ${className}`} style={style}>
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="skeleton-line" style={{ width: idx === 0 ? '80%' : idx === 1 ? '60%' : '100%' }} />
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className={`skeleton-list ${className}`} style={style}>
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="skeleton-list-item">
            <div className="skeleton-line" style={{ width: '30%' }} />
            <div className="skeleton-line" style={{ width: '50%' }} />
            <div className="skeleton-line" style={{ width: '20%' }} />
          </div>
        ))}
      </div>
    );
  }

  // Default: text lines
  return (
    <div className={`skeleton-text ${className}`} style={style}>
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="skeleton-line" style={{ width: idx === 0 ? '100%' : idx === rows - 1 ? '60%' : '90%' }} />
      ))}
    </div>
  );
};

// Specialized skeleton components
export const SkeletonTable: React.FC<{ rows?: number; columns?: number; className?: string }> = ({
  rows = 5,
  columns = 6,
  className = '',
}) => {
  return <SkeletonLoader type="table" rows={rows} columns={columns} className={className} />;
};

export const SkeletonCard: React.FC<{ rows?: number; className?: string }> = ({
  rows = 3,
  className = '',
}) => {
  return <SkeletonLoader type="card" rows={rows} className={className} />;
};

export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({
  rows = 5,
  className = '',
}) => {
  return <SkeletonLoader type="list" rows={rows} className={className} />;
};





