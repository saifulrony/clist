"use client";

import { Business } from "@/types";

interface ResultsTableProps {
  results: Business[];
}

export default function ResultsTable({ results }: ResultsTableProps) {
  if (results.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Results Found</h3>
        <p className="text-sm text-slate-500">Try adjusting your search criteria or location</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="min-w-full">
        <thead className="table-header">
          <tr>
            <th className="w-12">#</th>
            <th>Business Name</th>
            <th>Category</th>
            <th>Address</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Website</th>
            <th>Facebook</th>
            <th>Hours</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          {results.map((biz, i) => (
            <tr key={`${biz.name}-${biz.address}-${i}`} className="table-row">
              <td className="text-slate-400 font-medium">{i + 1}</td>
              <td>
                <div className="font-medium text-slate-900 max-w-[200px] truncate">
                  {biz.name}
                </div>
              </td>
              <td>
                {biz.category ? (
                  <span className="badge badge-blue">
                    {biz.category}
                  </span>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="max-w-[200px]">
                <span className="text-slate-600 truncate block" title={biz.address}>
                  {biz.address || "-"}
                </span>
              </td>
              <td>
                {biz.phone ? (
                  <a href={`tel:${biz.phone}`} className="link flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {biz.phone}
                  </a>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td>
                {biz.email ? (
                  <a href={`mailto:${biz.email}`} className="link flex items-center gap-1.5 max-w-[150px]">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{biz.email}</span>
                  </a>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td>
                {biz.website ? (
                  <a
                    href={biz.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    Visit
                  </a>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td>
                {biz.facebook ? (
                  <a
                    href={biz.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    Page
                  </a>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="max-w-[120px]">
                <span className="text-slate-500 text-xs truncate block" title={biz.opening_hours || ""}>
                  {biz.opening_hours || "-"}
                </span>
              </td>
              <td>
                {biz.rating > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5">
                      <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-sm font-semibold text-slate-700">{biz.rating}</span>
                    </div>
                    <span className="text-xs text-slate-400">({biz.total_rating})</span>
                  </div>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
