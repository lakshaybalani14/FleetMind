# FleetMind Dashboard - Quick Start

## 3 Steps to Running

1. `npm install`
2. `npm run dev`
3. Open http://localhost:3000

## What You'll See

- 4 Status Tiles (Gas, Temp, Actuator, Connectivity)
- Telemetry Chart (Gas/Temperature trends)
- Action Log (Event trace)

## Next Steps

1. Test the dashboard prototype (it currently uses simulated readings).
2. Review the cloud backend and its routes in [`infra/README.md`](infra/README.md).
3. Synthesize the CDK stack locally with `npm run typecheck` and `npm run synth` from `infra/`.
4. Review the proposed resources and cost footprint before explicitly approving an AWS deployment.
5. After deployment, add Cognito sign-in to Next.js and replace simulated readings with the authenticated API.
6. Build the anomaly model and monitoring; resume IoT Core and firmware after this cloud slice.
