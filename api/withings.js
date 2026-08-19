const crypto = require('crypto');

const COOKIE = 'vt_withings';
const API = 'https://wbsapi.withings.net';
const AUTH = 'https://account.withings.com/oauth2_user/authorize2';
const SCOPES = 'user.metrics,user.info';

function cfg() {
  return {
    clientId: process.env.WITHINGS_CLIENT_ID,
    clientSecret: process.env.WITHINGS_SESSION_SECRET
      ? process.env.WITHINGS_CLIENT_SECRET
      : process.env.WITHINGS_CLIENT_SECRET,
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
  const body = Buffer
    .from(JSON.stringify(obj))
    .toString('base64url');

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
  const cookies = req.headers.cookie || '';

  const match = cookies.match(
    new RegExp(
      '(?:^|; )' +
      name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '=([^;]*)'
    )
  );

  return match
    ? decodeURIComponent(match[1])
    : null;
}

function json(res, status, data) {
  res.statusCode = status;

  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  const c = cfg();

  const action =
    (req.query && req.query.action) || 'status';

  // STATUS
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

  // CONFIGURATION
  if (
    !c.clientId ||
    !c.clientSecret ||
    !c.redirectUri
  ) {
    return json(res, 503, {
      error: 'Withings connector not configured'
    });
  }

  // CONNEXION
  if (action === 'connect') {
    const nonce = crypto
      .randomBytes(24)
      .toString('hex');

    /*
     * Le state est signé et envoyé directement
     * à Withings.
     *
     * Il n'est donc plus nécessaire de dépendre
     * d'un cookie pour valider le retour OAuth.
     */
    const state = encode(
      {
        nonce,
        iat: Date.now()
      },
      c.secret
    );

    const url = new URL(AUTH);

    url.searchParams.set(
      'response_type',
      'code'
    );

    url.searchParams.set(
      'client_id',
      c.clientId
    );

    url.searchParams.set(
      'scope',
      SCOPES
    );

    url.searchParams.set(
      'redirect_uri',
      c.redirectUri
    );

    url.searchParams.set(
      'state',
      state
    );

    res.statusCode = 302;

    res.setHeader(
      'Location',
      url.toString()
    );

    return res.end();
  }

  // CALLBACK WITHINGS
  if (action === 'callback') {
    const state = String(
      req.query.state || ''
    );

    const code = String(
      req.query.code || ''
    );

    /*
     * Withings appelle parfois l'URL seule
     * pour vérifier qu'elle est accessible.
     */
    if (!state && !code) {
      return json(res, 200, {
        ok: true,
        ready: true
      });
    }

    /*
     * IMPORTANT :
     * on valide maintenant le state directement
     * depuis celui renvoyé par Withings.
     */
    const saved = decode(
      state,
      c.secret
    );

    if (
      !saved ||
      !saved.nonce ||
      !saved.iat ||
      Date.now() -
        Number(saved.iat) >
        10 * 60 * 1000 ||
      !code
    ) {
      return json(res, 400, {
        error:
          'Invalid Withings authorization state'
      });
    }

    // Échange du code contre les tokens
    const form = new URLSearchParams({
      action: 'requesttoken',
      grant_type:
        'authorization_code',
      client_id:
        c.clientId,
      client_secret:
        c.clientSecret,
      code,
      redirect_uri:
        c.redirectUri
    });

    const response = await fetch(
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

    const data =
      await response.json();

    if (
      data.status !== 0 ||
      !data.body?.refresh_token
    ) {
      return json(res, 502, {
        error:
          'Withings token exchange failed'
      });
    }

    // Création de la session
    const session = encode(
      {
        userid:
          data.body.userid,

        access_token:
          data.body.access_token,

        refresh_token:
          data.body.refresh_token,

        expires_at:
          Date.now() +
          Number(
            data.body.expires_in ||
            10800
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

    // Retour dans VitaTrack
    res.statusCode = 302;

    res.setHeader(
      'Location',
      '/'
    );

    return res.end();
  }

  // SESSION
  const session = decode(
    getCookie(req, COOKIE),
    c.secret
  );

  // DÉCONNEXION
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

  // RAFRAÎCHISSEMENT DU TOKEN
  async function refresh() {
    if (
      session.expires_at >
      Date.now() + 60000
    ) {
      return session;
    }

    const form = new URLSearchParams({
      action:
        'requesttoken',

      grant_type:
        'refresh_token',

      client_id:
        c.clientId,

      client_secret:
        c.clientSecret,

      refresh_token:
        session.refresh_token
    });

    const response = await fetch(
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

    const data =
      await response.json();

    if (data.status !== 0) {
      throw new Error(
        'Withings refresh failed'
      );
    }

    session.access_token =
      data.body.access_token;

    session.refresh_token =
      data.body.refresh_token;

    session.expires_at =
      Date.now() +
      Number(
        data.body.expires_in ||
        10800
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

  // MESURES
  if (action === 'measurements') {
    const s =
      await refresh();

    const end =
      Math.floor(
        Date.now() / 1000
      );

    const start =
      end -
      60 * 60 * 24 * 180;

    const form =
      new URLSearchParams({
        action: 'getmeas',

        meastype:
          '1,6,8,76,77,88',

        category: '1',

        startdate:
          String(start),

        enddate:
          String(end)
      });

    const response =
      await fetch(
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

    const data =
      await response.json();

    if (data.status !== 0) {
      return json(res, 502, {
        error:
          'Withings measurement request failed'
      });
    }

    const groups =
      data.body?.measuregrps || [];

    const measurements =
      groups
        .map((group) => {
          const result = {
            id:
              group.grpid,

            date:
              new Date(
                Number(group.date) *
                  1000
              )
                .toISOString()
                .slice(0, 10)
          };

          for (
            const measure
            of group.measures || []
          ) {
            const value =
              Number(
                measure.value
              ) *
              Math.pow(
                10,
                Number(
                  measure.unit || 0
                )
              );

            if (
              measure.type === 1
            ) {
              result.weight =
                value;
            }

            if (
              measure.type === 6
            ) {
              result.bodyFat =
                value;
            }

            if (
              measure.type === 8
            ) {
              result.fatMass =
                value;
            }

            if (
              measure.type === 76
            ) {
              result.muscleMass =
                value;
            }

            if (
              measure.type === 77
            ) {
              result.hydration =
                value;
            }

            if (
              measure.type === 88
            ) {
              result.visceralFat =
                value;
            }
          }

          return result;
        })
        .filter(
          (item) =>
            item.weight > 0
        );

    return json(res, 200, {
      measurements
    });
  }

  return json(res, 404, {
    error: 'Unknown action'
  });
};
