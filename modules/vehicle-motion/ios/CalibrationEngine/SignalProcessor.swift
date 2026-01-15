import Foundation

struct vector3 {
    let x: Double
    let y: Double
    let z: Double
    
    func length() -> Double {
        return (sqrt(x*x + y*y + z*z))
    }
    func normalized() -> vector3 {
        let l = length();
        return l > 1e-6 ? vector3(x: x/l, y: y/l, z: z/l) : vector3(x: 0, y: 0, z: 0)
    }
    func dot(_ other: vector3) -> Double {
        return (x*other.x + y*other.y + z*other.z)
    }
    func cross(_ other: vector3) -> vector3 {
        return vector3(x: y*other.z - z*other.y, y: z*other.x - x*other.z, z: x*other.y - y*other.x)
    }
    func inverted() -> vector3 {
        return vector3(x: -x, y: -y, z: -z)
    }
}

class SignalProcessor {
    private var linearEstimate: vector3?

    // tunables
    private var dt: Double = 1.0 / 50.0 // 50Hz
    private var fcMin: Double = 0.2
    private var fcMax: Double = 2.5
    private var gyroRef: Double = 1.5
    private var fcScale: Double = 1.0

    init() {}

    func setFilterAlpha(_ val: Double) {
        let clamped = max(0.05, min(0.8, val))
        let t = (clamped - 0.05) / (0.8 - 0.05)
        self.fcScale = 0.6 + t * 1.0
    }
    
    func setFcMin(_ val: Double) {
        self.fcMin = max(0.01, min(2.0, val))
    }
    
    func setFcMax(_ val: Double) {
        self.fcMax = max(0.5, min(10.0, val))
    }
    
    func setGyroRef(_ val: Double) {
        self.gyroRef = max(0.1, min(5.0, val))
    }

    func reset() {
        linearEstimate = nil
    }

    private func alpha(forCutoff fc: Double) -> Double {
        let f = max(0.01, min(10.0, fc))
        return 1.0 - exp(-2.0 * Double.pi * f * dt)
    }

    func update(accel: vector3, gravity: vector3, gyro: vector3? = nil, dt: Double = 1.0 / 50.0) -> vector3 {
        self.dt = dt

        let gMag: Double = {
            guard let g = gyro else { return 0.0 }
            return g.length()
        }()
        let t = max(0.0, min(1.0, gMag / gyroRef))
        let fc = (fcMin + t * (fcMax - fcMin)) * fcScale
        let a = alpha(forCutoff: fc)

        let prev = linearEstimate ?? accel
        let filtered = vector3(
            x: a * accel.x + (1.0 - a) * prev.x,
            y: a * accel.y + (1.0 - a) * prev.y,
            z: a * accel.z + (1.0 - a) * prev.z
        )

        linearEstimate = filtered
        return filtered
    }
}
