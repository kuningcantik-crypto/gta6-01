// The Solmar Bay tram: two cars looping the square of roads at
// x = ±104 and z = ±104, past the plaza, the hotel and the marina.
// Trams run on rails in the middle of the road, slow and steady, and
// never stop for anything — they are scenery with a timetable, not
// traffic, so they never collide with Rico, the police or other cars.
// The loop is parametric: each car has a distance along the loop and a
// speed, and position is pure geometry from that distance.

export const TRAM_LOOP_HALF = 104;
export const TRAM_SPEED = 7;
export const TRAM_CAR_LENGTH = 9;

// The loop's perimeter: four sides of 208 m each.
export const TRAM_LOOP_LENGTH = 8 * TRAM_LOOP_HALF;

export function createTram() {
  return {
    cars: [
      {along: 0, speed: TRAM_SPEED, line: 'A'},
      {along: TRAM_LOOP_LENGTH / 2, speed: TRAM_SPEED, line: 'B'},
    ],
  };
}

// Distance along the loop -> world position and heading. The loop runs
// counter-clockwise starting at the south-west corner, heading east
// along the south road first.
export function tramPose(along) {
  const half = TRAM_LOOP_HALF;
  const side = 2 * half;
  const d = ((along % TRAM_LOOP_LENGTH) + TRAM_LOOP_LENGTH) % TRAM_LOOP_LENGTH;
  if (d < side) return {x: -half + d, z: half, angle: Math.PI / 2};
  if (d < side * 2) return {x: half, z: half - (d - side), angle: 0};
  if (d < side * 3) return {x: half - (d - side * 2), z: -half, angle: -Math.PI / 2};
  return {x: -half, z: -half + (d - side * 3), angle: Math.PI};
}

export function tickTram(tram, dt) {
  for (const car of tram.cars) {
    car.along += car.speed * dt;
    if (car.along >= TRAM_LOOP_LENGTH) car.along -= TRAM_LOOP_LENGTH;
  }
}

// Where each tram car is right now, for the renderer.
export function tramPoses(tram) {
  return tram.cars.map((car) => {
    const pose = tramPose(car.along);
    return {x: pose.x, z: pose.z, angle: pose.angle, line: car.line};
  });
}

// Seconds until a tram car reaches a stop corner, for the HUD line.
// Trams are slow enough that the answer is usually "a while".
export function tramEta(tram, stopIndex) {
  const half = TRAM_LOOP_HALF;
  const side = 2 * half;
  const stopAlong = [side * 0.5, side * 1.5, side * 2.5, side * 3.5][stopIndex % 4];
  let soonest = Infinity;
  for (const car of tram.cars) {
    let ahead = stopAlong - car.along;
    if (ahead < 0) ahead += TRAM_LOOP_LENGTH;
    soonest = Math.min(soonest, ahead / car.speed);
  }
  return Math.round(soonest);
}

// The nearest tram stop to a point, for the HUD's "next tram" line.
// Stops sit at the four corners of the loop.
export function nearestTramStop(x, z) {
  const half = TRAM_LOOP_HALF;
  const corners = [
    {x: -half, z: half, name: 'Plaza South'},
    {x: half, z: half, name: 'Marina East'},
    {x: half, z: -half, name: 'Hotel North'},
    {x: -half, z: -half, name: 'Docks West'},
  ];
  let best = corners[0];
  let bestD = Infinity;
  for (const corner of corners) {
    const d = Math.hypot(corner.x - x, corner.z - z);
    if (d < bestD) {
      best = corner;
      bestD = d;
    }
  }
  return {name: best.name, dist: Math.round(bestD)};
}
