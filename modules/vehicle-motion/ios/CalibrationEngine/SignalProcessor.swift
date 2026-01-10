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
        return l > 0.00001 ? vector3(x: x/l, y: y/l, z: z/l) : vector3(x: 0, y: 0, z: 0)
    }
    func dot(_ other: vector3) -> Double {
        return (x*other.x + y*other.y + z*other.z)
    }
    func cross(_ other: vector3) -> vector3 {
        return vector3(x: y*other.z - z*other.y, y: z*other.x - x*other.z, z: x*other.y - y*other.x)
    }
}

class SignalProcessor {
    private var filteredValue: vector3?
    private let alpha: Double

    init(alpha: Double = 0.15) {
        self.alpha = alpha
    }

    func reset() {
        filteredValue = nil
    }

    func update(current: vector3) -> vector3 {
        guard let prev = filteredValue else {
            filteredValue = current
            return current
        }

        let x = alpha * current.x + (1.0 - alpha) * prev.x
        let y = alpha * current.y + (1.0 - alpha) * prev.y
        let z = alpha * current.z + (1.0 - alpha) * prev.z

        let newFiltered = vector3(x: x, y: y, z: z)
        filteredValue = newFiltered
        return newFiltered
    }
}