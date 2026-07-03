# Hardware / Electrical Schematic — one representative room

> Build this in **Wokwi** (recommended: ESP32 starter template) or Tinkercad.
> This document gives the full pin mapping, connection list and electrical
> reasoning needed to reproduce the circuit; one room (2 fans + 3 lights) is
> representative — the other two rooms are copies on different GPIO pins or
> separate ESP32 nodes.

## Concept

Each room gets one **ESP32 DevKit** node that senses whether each of its five
mains devices (2 ceiling fans, 3 lights) is actually drawing power, and
optionally how much. The node publishes state changes over Wi-Fi to the
backend (`POST /api/...` or MQTT), which is exactly the role the simulator
plays in the software demo — so the simulated layer and the real hardware are
drop-in replacements for each other.

```
mains device ──> sense circuit (isolated) ──> ESP32 GPIO/ADC ──> Wi-Fi ──> backend
```

## Sensing design (and why)

**On/off state — opto-isolated AC detector per device.**
A PC817 opto-coupler with a series rectifier diode (1N4007) and current-limit
resistor is wired in parallel with each device, after that device's wall
switch. When the switch is closed, mains flows through the opto's LED and the
photo-transistor pulls the ESP32 input LOW. The opto provides galvanic
isolation — the microcontroller side never touches 230 V. A 10 kΩ pull-up to
3V3 and a 100 nF debounce capacitor keep the input clean between AC half-cycles
(firmware also applies a ~50 ms software debounce because the opto conducts
only on positive half-waves).

**Current draw (optional) — non-invasive CT clamp per device group.**
An SCT-013-030 current transformer clips around each device's live wire.
Its output feeds a burden resistor (33 Ω for the 30 A/1 V variant) and a
half-supply DC bias (two 10 kΩ resistors + 10 µF capacitor) so the AC waveform
sits centred at 1.65 V inside the ESP32 ADC range. Firmware computes RMS
current → watts. This distinguishes "switch on but fan stalled" from real
consumption, and feeds the dashboard's power meter with measured (not
nameplate) wattage.

## Pin mapping — ESP32 DevKit, Room node

| Signal | Device | ESP32 pin | Direction | Notes |
|---|---|---|---|---|
| SENSE_FAN1 | Fan 1 state | GPIO 32 | input, pull-up | PC817 collector; LOW = ON |
| SENSE_FAN2 | Fan 2 state | GPIO 33 | input, pull-up | PC817 collector; LOW = ON |
| SENSE_LIGHT1 | Light 1 state | GPIO 25 | input, pull-up | PC817 collector; LOW = ON |
| SENSE_LIGHT2 | Light 2 state | GPIO 26 | input, pull-up | PC817 collector; LOW = ON |
| SENSE_LIGHT3 | Light 3 state | GPIO 27 | input, pull-up | PC817 collector; LOW = ON |
| CT_FANS | fans current | GPIO 34 (ADC1_CH6) | analog in | SCT-013 + 33 Ω burden + 1.65 V bias |
| CT_LIGHTS | lights current | GPIO 35 (ADC1_CH7) | analog in | second CT channel |
| STATUS_LED | node heartbeat | GPIO 2 | output | onboard LED, blinks on publish |
| 3V3 / GND | — | 3V3, GND | power | opto pull-ups and ADC bias divider |

GPIO 34/35 are chosen deliberately: they are **input-only ADC1** pins, so they
can't be misconfigured as outputs, and ADC1 keeps working while Wi-Fi is
active (ADC2 does not).

## Connection list (one sense channel — repeat ×5)

1. Device live (switched side) → 47 kΩ 1 W resistor → 1N4007 anode.
2. 1N4007 cathode → PC817 pin 1 (LED anode); PC817 pin 2 → device neutral.
3. PC817 pin 4 (collector) → ESP32 sense GPIO, plus 10 kΩ to 3V3.
4. PC817 pin 3 (emitter) → ESP32 GND.
5. 100 nF from sense GPIO to GND (ripple filter).

The 47 kΩ series resistor limits the opto LED current to ~5 mA at 230 V RMS
(≈ 1 W dissipation — use a 2 W part or two 22 kΩ in series for headroom).

## Wokwi modelling note

Wokwi has no 230 V mains parts, so model each device's switched live as a
**slide switch to 3V3 feeding the opto input side** (or drive the sense GPIO
directly through the switch) and each CT channel as a **potentiometer on
GPIO 34/35**. The firmware logic — debounce, RMS sampling, JSON publish over
Wi-Fi — is identical to the real circuit, which is what the simulation is
meant to demonstrate.

## Firmware behaviour (matches the backend contract)

Every 5 s, or immediately on a state change, the node publishes:

```json
{
  "room": "work1",
  "devices": [
    { "id": "work1-fan-1", "status": "on", "watts": 62 },
    { "id": "work1-light-3", "status": "off", "watts": 0 }
  ]
}
```

The backend treats this exactly like a simulator tick — same store, same
alerts, same dashboard and Discord updates.

## Safety notes

- All mains wiring stays on one side of the opto/CT boundary; the ESP32 side
  is extra-low-voltage only.
- CT clamps are non-invasive — no mains conductor is cut for current sensing.
- Fuse the sense taps (100 mA fast-blow) where they join the live conductor.
