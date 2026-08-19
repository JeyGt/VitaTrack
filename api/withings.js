// VitaTrack / Withings Public API connector (Vercel serverless function)
const crypto = require('crypto');

const COOKIE = 'vt_withings';
const STATE = 'vt_withings_state';
const API = 'https://wbsapi.withings.net';
const AUTH = 'https://account.withings.com/oauth2_user/authorize2';
const SCOPES = 'user.metrics,user.info';

function cfg() {
  return {
    clientId: process.env.WITHINGS_CLIENT_ID,
    clientSecret: process.env.WITHINGS_CLIENT_SECRET,
    redirectUri: process.env.WITHINGS_REDIRECT_URI || '',
    secret: process.env.WITHINGS_SESSION_SECRET || 'CHANGE_ME'
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

    if (!body || !sig || sign(body, secret) !== sig) {
      return null;
    }

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

module.exports = async (req, res) => {
  const c = cfg();

  const action =
    (req.query && req.query.action) || 'status';

  // Vérification de la configuration
  if (action === 'status') {
    return json(res, 200, {
      configured: !!(
        c.clientId &&
        c.clientSecret &&
        c.redirectUri
      ),
      connected: !!decode(
        getCookie(req, COOKIE),
        c.secret
      ),
      lastSync: null
    });
  }

  if (
    !c.clientId ||
    !c.clientSecret ||
    !c.redirectUri
  ) {
    return json(res, 503, {
      error: 'Withings connector not configured'
    });
  }

  // Début de la connexion Withings
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

    u.searchParams.set(
      'response_type',
      'code'
    );

    u.searchParams.set(
      'client_id',
      c.clientId
    );

    u.searchParams.set(
      'scope',
      SCOPES
    );

    u.searchParams.set(
      'redirect_uri',
      c.redirectUri
    );

    u.searchParams.set(
      'state',
      nonce
    );

    res.statusCode = 302;
    res.setHeader(
      'Location',
      u.toString()
    );

    return res.end();
  }

  // Retour depuis Withings
  if (action === 'callback') {
    const state = String(
      req.query.state || ''
    );

    const code = String(
      req.query.code || ''
    );

    // IMPORTANT :
    // Withings teste l'URL avant de l'accepter.
    // Ce test arrive sans code ni state.
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
        error:
          'Invalid Withings authorization state'
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
      return json(res, 502, {
        error:
          'Withings token exchange failed'
      });
    }

    const session = encode(
      {
        userid: d.body.userid,
        access_token: d.body.access_token,
        refresh_token: d.body.refresh_token,
        expires_at:
          Date.now() +
          Number(
            d.body.expires_in || 10800
          ) *
            1000
      },
      c.secret
    );

    setCookie(
      res,
      COOKIE,
      session,
      60 * 60 * 24 * 365
    );

    setCookie(
      res,
      STATE,
      '',
      0
    );

    res.statusCode = 302;
    res.setHeader(
      'Location',
      '/'
    );

    return res.end();
  }

  const session = decode(
    getCookie(req, COOKIE),
    c.secret
  );

  // Déconnexion
  if (action === 'disconnect') {
    setCookie(
      res,
      COOKIE,
      '',
      0
    );

    return json(res, 200, {
      ok: true
    });
  }

  if (!session) {
    return json(res, 401, {
      error: 'Not connected'
    });
  }

  // Renouvellement du token
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
      refresh_token:
        session.refresh_token
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

    if (d.status !== 0) {
      throw new Error(
        'Withings refresh failed'
      );
    }

    session.access_token =
      d.body.access_token;

    session.refresh_token =
      d.body.refresh_token;

    session.expires_at =
      Date.now() +
      Number(
        d.body.expires_in || 10800
      ) *
        1000;

    setCookie(
      res,
      COOKIE,
      encode(
        session,
        c.secret
      ),
      60 * 60 * 24 * 365
    );

    return session;
  }

  // Récupération des mesures
  if (action === 'measurements') {
    const s = await refresh();

    const end =
      Math.floor(
        Date.now() / 1000
      );

    const start =
      end -
      60 * 60 * 24 * 180;

    const form = new URLSearchParams({
      action: 'getmeas',
      meastype:
        '1,6,8,76,77,88',
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

          for (
            const m of
            g.measures || []
          ) {
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

    return json(res, 200, {
      measurements
    });
  }

  return json(res, 404, {
    error: 'Unknown action'
  });
};