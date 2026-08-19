// VitaTrack / Withings Public API connector
// Persistent Withings session via Supabase + Vercel serverless functions

const crypto = require('crypto');

const STATE = 'vt_withings_state';
const API = 'https://wbsapi.withings.net';
const AUTH = 'https://account.withings.com/oauth2_user/authorize2';
const SCOPES = 'user.metrics,user.info';

function cfg() {
  return {
    clientId: process.env.WITHINGS_CLIENT_ID,
    clientSecret: process.env.WITHINGS_CLIENT_SECRET,
    redirectUri: process.env.WITHINGS_REDIRECT_URI || '',
    secret: process.env.WITHINGS_SESSION_SECRET || 'CHANGE_ME',
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function sign(value, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64url');
}

function encode(obj, secret) {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return body + '.' + sign(body, secret);
}

function decode(value, secret) {
  try {
    const [body, sig] = String(value || '').split('.');
    if (!body || !sig || sign(body, secret) !== sig) return null;

    return JSON.parse(
      Buffer.from(body, 'base64url').toString()
    );
  } catch {
    return null;
  }
}

function setCookie(res, name, value, maxAge) {
  res.setHeader(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax${
      maxAge === 0
        ? '; Max-Age=0'
        : `; Max-Age=${maxAge}`
    }`
  );
}

function getCookie(req, name) {
  const h = req.headers.cookie || '';

  const m = h.match(
    new RegExp(
      '(?:^|; )' +
        name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '=([^;]*)'
    )
  );

  return m ? decodeURIComponent(m[1]) : null;
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function supabaseConfigured(c) {
  return !!(c.supabaseUrl && c.supabaseKey);
}

async function supabaseRequest(c, path, options = {}) {
  const r = await fetch(
    `${c.supabaseUrl}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: c.supabaseKey,
        Authorization: `Bearer ${c.supabaseKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }
  );

  const text = await r.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!r.ok) {
    console.error('Supabase error:', r.status, data);
    throw new Error(`Supabase request failed (${r.status})`);
  }

  return data;
}

// We have one Withings connection for the VitaTrack installation.
// The userid is still stored in the row and remains unique.
async function getConnection(c) {
  const rows = await supabaseRequest(
    c,
    'withings_connection?select=id,userid,access_token,refresh_token,expires_at,updated_at,last_sync_at&order=id.asc&limit=1',
    { method: 'GET' }
  );

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function saveConnection(c, session) {
  await supabaseRequest(
    c,
    'withings_connection?on_conflict=userid',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        userid: String(session.userid),
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: new Date(session.expires_at).toISOString(),
        updated_at: new Date().toISOString()
      })
    }
  );
}

async function updateConnection(c, userid, patch) {
  await supabaseRequest(
    c,
    `withings_connection?userid=eq.${encodeURIComponent(String(userid))}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString()
      })
    }
  );
}

async function deleteConnection(c) {
  await supabaseRequest(
    c,
    'withings_connection?id=not.is.null',
    {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal'
      }
    }
  );
}

module.exports = async (req, res) => {
  const c = cfg();

  const action =
    (req.query && req.query.action) || 'status';

  // Configuration check.
  if (action === 'status') {
    let connected = false;
    let lastSync = null;

    if (supabaseConfigured(c)) {
      try {
        const connection = await getConnection(c);
        connected = !!connection?.refresh_token;
        lastSync = connection?.last_sync_at || null;
      } catch (e) {
        console.error('Withings status / Supabase error:', e);
      }
    }

    return json(res, 200, {
      configured: !!(
        c.clientId &&
        c.clientSecret &&
        c.redirectUri &&
        supabaseConfigured(c)
      ),
      connected,
      lastSync
    });
  }

  if (
    !c.clientId ||
    !c.clientSecret ||
    !c.redirectUri ||
    !supabaseConfigured(c)
  ) {
    return json(res, 503, {
      error: 'Withings connector not configured'
    });
  }

  // Begin Withings OAuth connection.
  if (action === 'connect') {
    const nonce = crypto
      .randomBytes(24)
      .toString('hex');

    setCookie(
      res,
      STATE,
      encode(
        {
          nonce,
          iat: Date.now()
        },
        c.secret
      ),
      600
    );

    const u = new URL(AUTH);

    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', c.clientId);
    u.searchParams.set('scope', SCOPES);
    u.searchParams.set('redirect_uri', c.redirectUri);
    u.searchParams.set('state', nonce);

    res.statusCode = 302;
    res.setHeader('Location', u.toString());
    return res.end();
  }

  // Return from Withings OAuth.
  if (action === 'callback') {
    const state = String(req.query.state || '');
    const code = String(req.query.code || '');

    // Withings tests the callback URL before accepting it.
    if (!state && !code) {
      return json(res, 200, {
        ok: true,
        ready: true
      });
    }

    const saved = decode(
      getCookie(req, STATE),
      c.secret
    );

    if (
      !saved ||
      saved.nonce !== state ||
      !code
    ) {
      return json(res, 400, {
        error: 'Invalid Withings authorization state'
      });
    }

    const form = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      redirect_uri: c.redirectUri
    });

    const r = await fetch(
      API + '/v2/oauth2',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },
        body: form
      }
    );

    const d = await r.json();

    if (
      d.status !== 0 ||
      !d.body?.refresh_token
    ) {
      console.error('Withings token exchange:', d);
      return json(res, 502, {
        error: 'Withings token exchange failed'
      });
    }

    const session = {
      userid: d.body.userid,
      access_token: d.body.access_token,
      refresh_token: d.body.refresh_token,
      expires_at:
        Date.now() +
        Number(d.body.expires_in || 10800) * 1000
    };

    try {
      await saveConnection(c, session);
    } catch (e) {
      console.error('Saving Withings connection failed:', e);
      return json(res, 500, {
        error: 'Unable to save Withings connection'
      });
    }

    setCookie(res, STATE, '', 0);

    // No Withings session cookie is required anymore.
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }

  // Disconnect.
  if (action === 'disconnect') {
    try {
      await deleteConnection(c);
    } catch (e) {
      console.error('Withings disconnect error:', e);
      return json(res, 500, {
        error: 'Unable to disconnect Withings'
      });
    }

    setCookie(res, STATE, '', 0);

    return json(res, 200, {
      ok: true
    });
  }

  // All remaining actions use the persistent server-side connection.
  let session;

  try {
    session = await getConnection(c);
  } catch (e) {
    console.error('Loading Withings connection failed:', e);
    return json(res, 500, {
      error: 'Unable to load Withings connection'
    });
  }

  if (!session?.refresh_token) {
    return json(res, 401, {
      error: 'Not connected'
    });
  }

  // Convert the stored session to the shape used below.
  session.expires_at = new Date(session.expires_at).getTime();

  // Renew the token when it is about to expire.
  async function refresh() {
    if (
      session.expires_at >
      Date.now() + 60000
    ) {
      return session;
    }

    const form = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: session.refresh_token
    });

    const r = await fetch(
      API + '/v2/oauth2',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },
        body: form
      }
    );

    const d = await r.json();

    if (
      d.status !== 0 ||
      !d.body?.access_token ||
      !d.body?.refresh_token
    ) {
      console.error('Withings refresh response:', d);
      throw new Error('Withings refresh failed');
    }

    session.access_token = d.body.access_token;
    session.refresh_token = d.body.refresh_token;
    session.expires_at =
      Date.now() +
      Number(d.body.expires_in || 10800) * 1000;

    // IMPORTANT:
    // Withings can rotate the refresh token.
    // Persist the new access + refresh tokens immediately.
    await updateConnection(c, session.userid, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at:
        new Date(session.expires_at).toISOString()
    });

    return session;
  }

  // Retrieve Withings measurements.
  if (action === 'measurements') {
    let s;

    try {
      s = await refresh();
    } catch (e) {
      console.error('Withings token refresh error:', e);
      return json(res, 502, {
        error: 'Withings token refresh failed'
      });
    }

    const end =
      Math.floor(Date.now() / 1000);

    // Keep the current 180-day import window.
    const start =
      end - 60 * 60 * 24 * 180;

    const form = new URLSearchParams({
      action: 'getmeas',
      meastype: '1,6,8,76,77,88',
      category: '1',
      startdate: String(start),
      enddate: String(end)
    });

    const r = await fetch(
      API + '/measure',
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${s.access_token}`,
          'Content-Type':
            'application/x-www-form-urlencoded'
        },
        body: form
      }
    );

    const d = await r.json();

    if (d.status !== 0) {
      console.error('Withings measurement response:', d);
      return json(res, 502, {
        error:
          'Withings measurement request failed'
      });
    }

    const groups =
      d.body?.measuregrps || [];

    const measurements =
      groups
        .map((g) => {
          const out = {
            id: g.grpid,
            date:
              new Date(
                Number(g.date) * 1000
              )
                .toISOString()
                .slice(0, 10)
          };

          for (const m of g.measures || []) {
            const v =
              Number(m.value) *
              Math.pow(
                10,
                Number(m.unit || 0)
              );

            if (m.type === 1)
              out.weight = v;

            if (m.type === 6)
              out.bodyFat = v;

            if (m.type === 8)
              out.fatMass = v;

            if (m.type === 76)
              out.muscleMass = v;

            if (m.type === 77)
              out.hydration = v;

            if (m.type === 88)
              out.visceralFat = v;
          }

          return out;
        })
        .filter(
          (x) => x.weight > 0
        );

    try {
      await updateConnection(c, s.userid, {
        last_sync_at:
          new Date().toISOString()
      });
    } catch (e) {
      // The measurements themselves are still valid.
      console.error(
        'Unable to save last_sync_at:',
        e
      );
    }

    return json(res, 200, {
      measurements
    });
  }

  return json(res, 404, {
    error: 'Unknown action'
  });
};
