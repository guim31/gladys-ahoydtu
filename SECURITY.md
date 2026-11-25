# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Network**: it only talks to the address entered in its configuration, on
  the local network, over plain HTTP (AhoyDTU serves no HTTPS): `GET /api/...`
  to read, and `POST /api/ctrl` for the power limit, sent only when the user
  enabled "Allow the power limit".
- **Secrets**: the optional AhoyDTU admin password, kept by Gladys in the
  integration configuration. It travels in the body of `POST /api/ctrl` (in
  clear, as AhoyDTU requires), and is never logged nor written to `/data`.
  Credentials typed in the address are dropped.
- **Stored data**: `/data/inventory.json`, the list of inverters (serials,
  names, panel names) and the address of the DTU.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services and devices the integration talks to.
