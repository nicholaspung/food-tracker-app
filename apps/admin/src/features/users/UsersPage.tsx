import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { searchUsers } from '@/features/users/api';
import { formatDateTime } from '@/lib/formatters';

export function UsersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', deferredSearchTerm],
    queryFn: () => searchUsers(deferredSearchTerm),
  });

  return (
    <>
      <section className="panel">
        <p className="eyebrow">User review</p>
        <h2 style={{ marginBottom: 0 }}>Search accounts for moderation context</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Search by email, name, or partial ID. Individual user pages aggregate visits, items,
          notes, feedback, and uploads.
        </p>
      </section>

      <section className="panel">
        <div className="field">
          <label htmlFor="user-search">Search users</label>
          <input
            className="input"
            id="user-search"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by email, name, or id"
            type="search"
            value={searchTerm}
          />
        </div>
      </section>

      {usersQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading users...</strong>
        </section>
      ) : null}

      {usersQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load users</strong>
          <span className="text-muted">
            Confirm that the admin account can read the `users` collection.
          </span>
        </section>
      ) : null}

      {usersQuery.data ? (
        <section className="table-panel">
          <div className="summary-row">
            <div>
              <p className="eyebrow">Directory</p>
              <h3>{usersQuery.data.length} account(s)</h3>
            </div>
          </div>

          {usersQuery.data.length === 0 ? (
            <div className="state-panel">
              <span className="text-muted">No users matched your search.</span>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {usersQuery.data.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email}</td>
                      <td>{user.name?.trim() || 'No display name'}</td>
                      <td>
                        <span className="tag">{user.isAdmin ? 'admin' : 'user'}</span>
                      </td>
                      <td>{formatDateTime(user.created)}</td>
                      <td>
                        <Link className="route-link" to={`/users/${user.id}`}>
                          Inspect
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
