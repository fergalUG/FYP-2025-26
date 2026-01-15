import CoreMotion
import SceneKit

struct SensorDiagnostics {
    var accelMagnitude: Double = 0.0
    var accelStability: Double = 0.0
    var yawVelocity: Double = 0.0
    var isAccelStable: Bool = false
    var isAccelInRange: Bool = false
    var isHeadingSteady: Bool = false
    var rejectionReason: String = ""
    
    
    func toDictionary() -> [String: Any] {
        return [
            "accelMagnitude": accelMagnitude,
            "accelStability": accelStability,
            "yawVelocity": yawVelocity,
            "isAccelStable": isAccelStable,
            "isAccelInRange": isAccelInRange,
            "isHeadingSteady": isHeadingSteady,
            "rejectionReason": rejectionReason
        ]
    }
}

struct sample {
    var acceleration: vector3
    var attitude: CMAttitude
    var gravity: vector3
}

final class CalibrationEngine {
    private(set) var isCalibrating = false
    var hasCalibration: Bool { return rotationMatrix != nil }

    let signalProcessor = SignalProcessor()
    
    private var calibrationSamples: [sample] = []
    private var sampleBuffer: [vector3] = []
    
    private(set) var rotationMatrix: [[Double]]?
    
    private(set) var referenceAttitude: CMAttitude?
    private var calibrationStartYaw: Double?
    private var lastValidYaw: Double?

    private let accelerationThreshold: Double = 0.15
    private let stabilityThreshold: Double = 0.96
    private let turningThreshold: Double = 0.09 // ~5 degrees in radians
    private let samplesNeeded: Int = 250

    private(set) var sensorDiagnostics: SensorDiagnostics = SensorDiagnostics()

    // for testing
    private(set) var referenceMatrix: [[Double]]?
    
    func resetForTracking() {
        isCalibrating = true
        sampleBuffer.removeAll()
        calibrationSamples.removeAll()
        rotationMatrix = nil
        calibrationStartYaw = nil
        lastValidYaw = nil
        signalProcessor.reset()
    }
    
    func getSensorDiagnostics() -> SensorDiagnostics {
        return self.sensorDiagnostics
    }
    
    /*
     This func will handle starting the auto calibration sequence. It will collect samples that are determined to be straight
     and will add them to the buffer. Once the buffer is full the func will return
     */
    func handleAutoCalibration(
        accel: vector3,
        gravity: vector3,
        attitude: CMAttitude,
        gyro: vector3,
        onStatus: (_ status: String, _ message: String, _ progress: Double?) -> Void,
        onComplete: (_ payload: [String: Any]) -> Void
    ) {
        let filteredAccel = signalProcessor.update(accel: accel, gravity: gravity, gyro: gyro)

        sampleBuffer.append(filteredAccel)
        if sampleBuffer.count > 50 {
            sampleBuffer.removeFirst()
        }
        
        guard sampleBuffer.count >= 50 else { return }
        
        let sumX: Double = sampleBuffer.reduce(0.0) { $0 + $1.x }
        let sumY: Double = sampleBuffer.reduce(0.0) { $0 + $1.y }
        let sumZ: Double = sampleBuffer.reduce(0.0) { $0 + $1.z }
        let count: Double = Double(sampleBuffer.count)
        let avgVector = vector3(x: sumX / count, y: sumY / count, z: sumZ / count)
        
        self.sensorDiagnostics.accelMagnitude = avgVector.length()
        self.sensorDiagnostics.isAccelInRange = self.sensorDiagnostics.accelMagnitude > accelerationThreshold
        
        var isStable: Bool = true
        let avgNorm = avgVector.normalized()
        var minDot: Double = 1.0
        for sample in sampleBuffer {
            let dotProduct: Double = sample.normalized().dot(avgNorm)
            minDot = min(minDot, dotProduct)
            if dotProduct < stabilityThreshold {
                isStable = false
                break
            }
        }
        
        self.sensorDiagnostics.accelStability = minDot
        self.sensorDiagnostics.isAccelStable = isStable
        
        let isDrivingStraight: Bool = isStable && avgVector.length() > accelerationThreshold
        let currentYaw: Double = attitude.yaw
        
        if isDrivingStraight {
            if calibrationStartYaw == nil {
                calibrationStartYaw = currentYaw
                lastValidYaw = currentYaw
                self.sensorDiagnostics.rejectionReason = ""
                return
            }
            
            let yawDelta: Double = currentYaw - (lastValidYaw ?? currentYaw)
            let yawNormalised: Double = abs(atan2(sin(yawDelta), cos(yawDelta)))
            
            self.sensorDiagnostics.yawVelocity = yawNormalised
            self.sensorDiagnostics.isHeadingSteady = yawNormalised <= turningThreshold
            
            if yawNormalised > turningThreshold {
                calibrationSamples.removeAll() // user turned, discard samples
                lastValidYaw = currentYaw
                self.sensorDiagnostics.rejectionReason = "turning"
                return
            }
            
            lastValidYaw = currentYaw
            calibrationSamples.append(sample(
                acceleration: filteredAccel,
                attitude: attitude.copy() as! CMAttitude,
                gravity: gravity,
            ))
            
            self.sensorDiagnostics.rejectionReason = ""
            
            if calibrationSamples.count % 10 == 0 {
                onStatus("collecting", "Collecting samples... \(calibrationSamples.count)/\(samplesNeeded)", Double(calibrationSamples.count) / Double(samplesNeeded))
            }
            
            if calibrationSamples.count >= samplesNeeded {
                performAutoCalibration(onStatus: onStatus, onComplete: onComplete)
            }
        } else {
            if !calibrationSamples.isEmpty {
                calibrationSamples.removeAll()
                onStatus("detecting", "Lost stability. Starting over.", nil)
            }
            calibrationStartYaw = nil
            lastValidYaw = nil
            
            if !isStable {
                self.sensorDiagnostics.rejectionReason = "accel_unstable"
            } else if self.sensorDiagnostics.accelMagnitude <= accelerationThreshold {
                self.sensorDiagnostics.rejectionReason = "accel_low"
            } else {
                self.sensorDiagnostics.rejectionReason = ""
            }
        }
    }
    
    private func performAutoCalibration(
        onStatus: (_ status: String, _ message: String, _ progress: Double?) -> Void,
        onComplete: (_ payload: [String: Any]) -> Void
    ) {
        onStatus("processing", "Calculating Alignment...", nil)
        
        let count: Double = Double(calibrationSamples.count)
        let avgGravity: vector3 = vector3(
            x: calibrationSamples.reduce(0.0) { $0 + $1.gravity.x } / count,
            y: calibrationSamples.reduce(0.0) { $0 + $1.gravity.y } / count,
            z: calibrationSamples.reduce(0.0) { $0 + $1.gravity.z } / count
        )
        let avgAcceleration: vector3 = vector3(
            x: calibrationSamples.reduce(0.0) { $0 + $1.acceleration.x } / count,
            y: calibrationSamples.reduce(0.0) { $0 + $1.acceleration.y } / count,
            z: calibrationSamples.reduce(0.0) { $0 + $1.acceleration.z } / count
        )
        
        //gravity is always down so we can use it to find the z axis
        let zAxis: vector3 = avgGravity.normalized().inverted()
        
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
            "matrix": self.rotationMatrix!,
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

    //testing only

    func getCalibrationError() -> [String: Double]? {
        guard let ref = referenceMatrix, let auto = rotationMatrix else { return nil }
        
        let refZ = vector3(x: ref[2][0], y: ref[2][1], z: ref[2][2])
        let autoZ = vector3(x: auto[2][0], y: auto[2][1], z: auto[2][2])
        
        let refX = vector3(x: ref[0][0], y: ref[0][1], z: ref[0][2])
        let autoX = vector3(x: auto[0][0], y: auto[0][1], z: auto[0][2])
        
        let dotZ = min(max(refZ.dot(autoZ), -1.0), 1.0)
        let dotX = min(max(refX.dot(autoX), -1.0), 1.0)
        
        let angleZ = acos(dotZ) * (180.0 / .pi)
        let angleX = acos(dotX) * (180.0 / .pi)
        
        return [
            "verticalError": angleZ,
            "forwardError": angleX
        ]
    }

    func captureReferenceMatrix(gravity: vector3) {
        let zAxis = gravity.normalized().inverted()
        
        var tentativeForward = vector3(x: 0, y: 1, z: 0)
        if abs(zAxis.y) > 0.8 {
            tentativeForward = vector3(x: 0, y: 0, z: -1)
        }
        
        let yAxis = zAxis.cross(tentativeForward).normalized()
        let xAxis = yAxis.cross(zAxis).normalized()
        
        self.referenceMatrix = [
            [xAxis.x, xAxis.y, xAxis.z],
            [yAxis.x, yAxis.y, yAxis.z],
            [zAxis.x, zAxis.y, zAxis.z]
        ]
    }
}
