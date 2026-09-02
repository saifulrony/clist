'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface SavedBusiness {
  id: number;
  name: string;
  address: string;
  phone: string;
  website: string;
  email: string;
  facebook: string;
  country: string;
  latitude: number;
  longitude: number;
  rating: number;
  total_rating: number;
  place_id: string;
  category: string;
  opening_hours: string;
  source: string;
  tags: string;
  notes: string;
  created_at: string;
}

export default function MyDataPage() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<SavedBusiness[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const api = typeof window !== 'undefined' ? `http://${window.location.hostname}:18001` : 'http://127.0.0.1:18001';
    fetch(`${api}/api/user/saved?limit=${limit}&offset=${page * limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d.results || []);
        setTotal(d.total || 0);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load data');
        setLoading(false);
      });
  }, [token, page]);

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this business?')) return;
    const api = typeof window !== 'undefined' ? `http://${window.location.hostname}:18001` : 'http://127.0.0.1:18001';
    await fetch(`${api}/api/user/saved/delete?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setData(data.filter((d) => d.id !== id));
    setTotal(total - 1);
  };

  const handleExportCSV = () => {
    if (data.length === 0) return;
    const headers = ['Name', 'Address', 'Phone', 'Website', 'Email', 'Facebook', 'Country', 'Category', 'Tags', 'Notes'];
    const rows = data.map((b) => [
      b.name, b.address, b.phone, b.website, b.email, b.facebook, b.country, b.category, b.tags, b.notes,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-business-data.csv';
    a.click();
  };

  if (authLoading || !user) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>My Saved Data</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {total} businesses saved
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" onClick={handleExportCSV} disabled={data.length === 0}>
            Export CSV
          </button>
          <Link href="/" className="btn-secondary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            New Search
          </Link>
        </div>
      </div>

      {error && (
        <div className="warning-banner warning-error">{error}</div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : data.length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '16px' }}>No saved businesses yet</p>
          <Link href="/" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Search for Businesses
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.map((b) => (
            <div key={b.id} className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>{b.name}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>{b.address}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '0.85rem' }}>
                    {b.phone && <span>Phone: {b.phone}</span>}
                    {b.email && <span>Email: {b.email}</span>}
                    {b.website && (
                      <span>
                        <a href={b.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                          Website
                        </a>
                      </span>
                    )}
                    {b.facebook && (
                      <span>
                        <a href={b.facebook} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                          Facebook
                        </a>
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    {b.tags && <span className="tag" style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)' }}>{b.tags}</span>}
                    {b.source && <span className="tag" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--accent)' }}>Source: {b.source}</span>}
                    {b.created_at && <span className="tag" style={{ color: 'var(--text-muted)' }}>Saved: {new Date(b.created_at).toLocaleDateString()}</span>}
                  </div>
                  {b.notes && <p style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Notes: {b.notes}</p>}
                </div>
                <button
                  onClick={() => handleDelete(b.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.85rem', padding: '4px 8px' }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
          <button className="btn-secondary" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
            ← Previous
          </button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Page {page + 1} of {Math.ceil(total / limit)}
          </span>
          <button className="btn-secondary" onClick={() => setPage(page + 1)} disabled={(page + 1) * limit >= total}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
