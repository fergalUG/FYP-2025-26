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
    private(set) var autoCalibrationEnabled = false
    
    private var calibrationSamples: [sample] = []
    private var sampleBuffer: [vector3] = []
    
    private(set) var rotationMatrix: [[Double]]?
    
    private(set) var referenceAttitude: CMAttitude?
    private var calibrationStartYaw: Double?
    private var lastValidYaw: Double?
    
    func resetForTracking(autoCalibrate: Bool) {
        autoCalibrationEnabled = autoCalibrate
        isCalibrating = autoCalibrate
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
    
    
}
