# FleetMind quick start

This guide starts the Next.js dashboard locally. A running dashboard is separate from the deployed AWS services and from the ESP32 firmware.

## 1. Start the dashboard

From the repository root:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` for the introduction page. **Sign in securely** opens the existing Amazon Cognito sign-in flow; after sign-in, the callback opens `/monitoring`. With a valid session, **Enter the platform** opens Monitoring directly. The two browser previews show saved images of Monitoring and Analytics; the dashboards themselves use live data after sign-in. The local app needs the correct Cognito and FleetMind API values in the root `.env.local` to authenticate and display live AWS data. Use `.env.local.example` as the variable-name reference; copy actual values from the AWS deployment outputs or team handoff. Never commit `.env.local`, access tokens, or device credentials.

The authentication callback is configured for `http://localhost:3000/auth/callback`. Do not replace localhost with a LAN IP or another port unless the Cognito callback and allowed origins are also updated.

## 2. Connect the ESP32 node

See [firmware setup, GPIO wiring and MQTT topics](firmware/README.md). Configure a unique `NODE_ID` that matches the AWS IoT Thing and use that node's certificate. Build and flash with PlatformIO:

```text
pio run
pio run --target upload
pio device monitor
```

The firmware samples every two seconds, publishes retained status about every 15 seconds, and acknowledges relay commands. The board must have Wi-Fi and a valid clock for TLS/MQTT connectivity.

## 3. Confirm live data

1. Sign in at `http://localhost:3000/monitoring`.
2. Confirm the selected node appears and its status changes to online.
3. Check the current values and moving chart.
4. Use a safe synthetic test only when verifying threshold display; use a fresh timestamp and clearly identify the message as synthetic.
5. Toggle the relay only with a safe, correctly rated low-voltage demo load; confirm the device acknowledgement in the activity list.

## Service references

- [Event workflows and MQTT/API payloads](docs/project-events.md)
- [Live-test results and remaining checks](docs/live-testing-log.md)
- [AWS routes and CDK/live-resource notes](infra/README.md)
- [Project status and handoff](docs/project-status.md)

## Local checks

The root package contains `dev`, `build`, and `start` scripts. Infrastructure typechecking and synthesis are run from `infra/`:

```bash
npm run typecheck
npm run synth
```

Synthesis is local and does not deploy resources. Live AWS resources were configured manually and differ from parts of the CDK declaration; review the diff before any deployment.
