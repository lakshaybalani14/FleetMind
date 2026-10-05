# FleetMind Dashboard

AWS IoT Fleet Telemetry & Edge Automation Control Platform

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Current project status

| Area | Status |
| --- | --- |
| Next.js dashboard | Built as a frontend prototype; it currently uses simulated telemetry. |
| ESP32 firmware | Firmware project is present; hardware compilation and two-node testing remain. |
| AWS IoT Core | Deferred for the current setup pass. |
| AWS storage and authenticated API | CDK implementation added under `infra/`; not deployed yet. |
| Dashboard-to-AWS integration | Not started; depends on deploying the API and adding Cognito sign-in. |
| Anomaly ML, actuator automation, hosting, and CI/CD | Not built yet. |

## Next steps

1. Review `infra/README.md` and the CDK synth/diff before approving any AWS deployment.
2. Deploy the backend in `ap-southeast-2`, then add the Cognito sign-in flow and wire the dashboard to its API.
3. Build and test the anomaly-detection service, then add controlled device automation when IoT Core work resumes.
4. Choose frontend hosting and add CloudWatch alarms and CI/CD.

See [`infra/README.md`](infra/README.md) for backend routes, DynamoDB access patterns, and setup commands.
