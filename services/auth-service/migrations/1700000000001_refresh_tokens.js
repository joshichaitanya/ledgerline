// Access tokens are short-lived (15 min) and never stored - a service
// verifies them purely by signature/expiry (see services/toolkit). Refresh
// tokens are the opposite: long-lived (30 days) and *do* need to be stored,
// because they're the thing that makes logout and password-change actually
// revoke access - deleting a row here is what "log out" means.
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE refresh_tokens (
      jti        uuid PRIMARY KEY,
      user_id    integer NOT NULL REFERENCES users(id),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS refresh_tokens;
  `);
};
