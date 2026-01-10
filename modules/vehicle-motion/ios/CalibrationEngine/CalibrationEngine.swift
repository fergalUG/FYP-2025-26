import CoreMotion
import SceneKit

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

struct sample {
    var x: Double
    var y: Double
    var z: Double
    var attitude: CMAttitude
    var gravity: vector3
}

final class CalibrationEngine {
    private(set) var isCalibrating = false
    var hasCalibration: Bool { return rotationMatrix != nil }
    
    private var calibrationSamples: [sample] = []
    private var sampleBuffer: [vector3] = []
    
    private(set) var rotationMatrix: [[Double]]?
    
    private(set) var referenceAttitude: CMAttitude?
    private var calibrationStartYaw: Double?
    private var lastValidYaw: Double?
    
    func resetForTracking() {
        isCalibrating = true
        sampleBuffer.removeAll()
        calibrationSamples.removeAll()
        calibrationStartYaw = nil
        lastValidYaw = nil
    }
    
    /*
     This func will handle starting the auto calibration sequence. It will collect samples that are determined to be straight
     and will add them to the buffer. Once the buffer is full the func will return
     */
    func handleAutoCalibration(
        accel: CMAcceleration,
        gravity: CMAcceleration,
        attitude: CMAttitude,
        onStatus: (_ status: String, _ message: String, _ progress: Double?) -> Void,
        onComplete: (_ payload: [String: Any]) -> Void
    ) {
        sampleBuffer.append(vector3(x: accel.x, y: accel.y, z: accel.z))
        if sampleBuffer.count > 50 {
            sampleBuffer.removeFirst()
        }
        
        guard sampleBuffer.count >= 50 else { return }
        
        let sumX: Double = sampleBuffer.reduce(0.0) { $0 + $1.x }
        let sumY: Double = sampleBuffer.reduce(0.0) { $0 + $1.y }
        let sumZ: Double = sampleBuffer.reduce(0.0) { $0 + $1.z }
        let count: Double = Double(sampleBuffer.count)
        let avgVector = vector3(x: sumX / count, y: sumY / count, z: sumZ / count)
        
        let avgVectorMagnitude: Double = avgVector.length()
        
        var isStable: Bool = true
        for sample in sampleBuffer {
            let dotProduct: Double = sample.normalized().dot(avgVector.normalized())
            if dotProduct < 0.98 {
                isStable = false
                break
            }
        }
        
        let isDrivingStraight: Bool = isStable && avgVectorMagnitude > 0.08
        let currentYaw: Double = attitude.yaw
        
        if isDrivingStraight {
            if calibrationStartYaw == nil {
                calibrationStartYaw = currentYaw
                lastValidYaw = currentYaw
                return
            }
            
            let yawDelta: Double = currentYaw - (lastValidYaw ?? currentYaw)
            let yawNormalised: Double = abs(atan2(sin(yawDelta), cos(yawDelta)))
            
            //if turning more that 5 degrees (radians)
            if yawNormalised > 0.09 {
                calibrationSamples.removeAll()
                return
            }
            
            lastValidYaw = currentYaw
            calibrationSamples.append(sample(
                x: accel.x,
                y: accel.y,
                z: accel.z,
                attitude: attitude.copy() as! CMAttitude,
                gravity: vector3(x: gravity.x, y: gravity.y, z: gravity.z)
            ))
            
            if calibrationSamples.count % 50 == 0 {
                onStatus("collecting", "Collecting samples... \(calibrationSamples.count)/250", Double(calibrationSamples.count) / 250.0)
            }
            
            if calibrationSamples.count >= 250 {
                performAutoCalibration(onStatus: onStatus, onComplete: onComplete)
            }
        } else {
            calibrationStartYaw = nil
            lastValidYaw = nil
        }
    }
    
    private func performAutoCalibration(
        onStatus: (_ status: String, _ message: String, _ progress: Double?) -> Void,
        onComplete: (_ payload: [String: Any]) -> Void
    ) {
        onStatus("processing", "Calculating Alignment...", 1.0)
        
        let count: Double = Double(calibrationSamples.count)
        let avgGravity: vector3 = vector3(
            x: calibrationSamples.reduce(0.0) { $0 + $1.gravity.x } / count,
            y: calibrationSamples.reduce(0.0) { $0 + $1.gravity.y } / count,
            z: calibrationSamples.reduce(0.0) { $0 + $1.gravity.z } / count
        )
        let avgAcceleration: vector3 = vector3(
            x: calibrationSamples.reduce(0.0) { $0 + $1.x } / count,
            y: calibrationSamples.reduce(0.0) { $0 + $1.y } / count,
            z: calibrationSamples.reduce(0.0) { $0 + $1.z } / count
        )
        
        //gravity is always down so we can use it to find the z axis
        let zAxis: vector3 = avgGravity.normalized()
        
        //the cross product of the forward acceleration and the z axis gives the orthogonal y axis
        let yAxis: vector3 = zAxis.cross(avgAcceleration).normalized()
        
        //finally we can take our real x axis as the axis orthogonal to both y and z axes
        let xAxis: vector3 = yAxis.cross(zAxis).normalized()
        
        let matrix: [[Double]] = [
            [xAxis.x, xAxis.y, xAxis.z],
            [yAxis.x, yAxis.y, yAxis.z],
            [zAxis.x, zAxis.y, zAxis.z]
        ]
        
        self.rotationMatrix = matrix
        self.isCalibrating = false
        
        onComplete([
            "matrix": matrix,
            "sampleCount": calibrationSamples.count
        ])
    }
    
    private func transform(accel: vector3, with matrix: [[Double]]) -> vector3 {
        let x = matrix[0][0] * accel.x + matrix[0][1] * accel.y + matrix[0][2] * accel.z
        let y = matrix[1][0] * accel.x + matrix[1][1] * accel.y + matrix[1][2] * accel.z
        let z = matrix[2][0] * accel.x + matrix[2][1] * accel.y + matrix[2][2] * accel.z
        return vector3(x: x, y: y, z: z)
    }
    
    func applyRotation(x: Double, y: Double, z: Double) -> vector3 {
        let input: vector3 = vector3(x: x, y: y, z: z)
        guard let matrix = self.rotationMatrix else {
            return input
        }
        return transform(accel: input, with: matrix)
    }
}
