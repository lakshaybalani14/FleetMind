import assert from "node:assert/strict";
import test from "node:test";
import { decideAutomaticRelay, loadAutomationThresholds } from "./actuator-control";

const thresholds = { gasOn: 400, gasOff: 350, temperatureOn: 60, temperatureOff: 58 };

test("automatic relay turns on when either configured threshold is crossed", () => {
  assert.equal(decideAutomaticRelay({ gasLevel: 400, temperature: 20 }, false, thresholds), true);
  assert.equal(decideAutomaticRelay({ gasLevel: 100, temperature: 60, }, false, thresholds), true);
});

test("automatic relay holds state in the hysteresis band and turns off when both readings clear", () => {
  assert.equal(decideAutomaticRelay({ gasLevel: 375, temperature: 59 }, false, thresholds), undefined);
  assert.equal(decideAutomaticRelay({ gasLevel: 300, temperature: 40 }, true, thresholds), false);
});

test("anomaly inference can request relay on while automatic mode is active", () => {
  assert.equal(decideAutomaticRelay({ gasLevel: 100, temperature: 20, isAnomaly: true }, false, thresholds), true);
  assert.equal(decideAutomaticRelay({ gasLevel: 100, temperature: 20, isAnomaly: true }, true, thresholds), undefined);
});

test("threshold configuration must be complete and have lower release thresholds", () => {
  assert.deepEqual(loadAutomationThresholds({
    AUTO_GAS_ON_PPM: "400",
    AUTO_GAS_OFF_PPM: "350",
    AUTO_TEMP_ON_C: "60",
    AUTO_TEMP_OFF_C: "58",
  }), thresholds);
  assert.equal(loadAutomationThresholds({}), undefined);
  assert.equal(loadAutomationThresholds({
    AUTO_GAS_ON_PPM: "350",
    AUTO_GAS_OFF_PPM: "400",
    AUTO_TEMP_ON_C: "60",
    AUTO_TEMP_OFF_C: "58",
  }), undefined);
});
