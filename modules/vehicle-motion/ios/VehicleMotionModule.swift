import CoreMotion
import ExpoModulesCore

public class VehicleMotionModule: Module {
    private let motionManager = CMMotionManager()
    private let signalProcessor = SignalProcessor()

    public func definition() -> ModuleDefinition {
        Name("VehicleMotion")
        
        Events("onMotionUpdate")
        
        Function("startTracking") {
            startTracking()
        }
        
        Function("stopTracking") {
            motionManager.stopDeviceMotionUpdates()
        }

        Function("setFilterAlpha") { (value: Double) in
            signalProcessor.setFilterAlpha(value)
            
            print("VehicleMotion: Filter Alpha updated to \(value)")
        }
        
        Function("setFcMin") { (value: Double) in
            signalProcessor.setFcMin(value)
        }
        
        Function("setFcMax") { (value: Double) in
            signalProcessor.setFcMax(value)
        }
        
        Function("setGyroRef") { (value: Double) in
            signalProcessor.setGyroRef(value)
        }
    }
    
    private func startTracking() {
        signalProcessor.reset()
        
        if motionManager.isDeviceMotionAvailable {
            motionManager.deviceMotionUpdateInterval = 1.0 / 50.0
            
            motionManager.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
                guard let data = data, let self = self else { return }
                
                let accel = data.userAcceleration
                let gravity = data.gravity
                let gyro = data.rotationRate
                
                let rawAccel = vector3(x: accel.x, y: accel.y, z: accel.z)
                let rawGravity = vector3(x: gravity.x, y: gravity.y, z: gravity.z)
                let rawGyro = vector3(x: gyro.x, y: gyro.y, z: gyro.z)

                let filteredAccel = self.signalProcessor.update(accel: rawAccel, gravity: rawGravity, gyro: rawGyro)

                let normalizedGravity = rawGravity.normalized()
                let verticalComponent = filteredAccel.dot(normalizedGravity)
                let verticalAccel = normalizedGravity.scaled(by: verticalComponent)
                let horizontalAccel = filteredAccel.subtract(verticalAccel)
                let horizontalMagnitude = horizontalAccel.length()

                self.sendEvent("onMotionUpdate", [
                    "x": filteredAccel.x,
                    "y": filteredAccel.y,
                    "z": filteredAccel.z,

                    "rawX": rawAccel.x,
                    "rawY": rawAccel.y,
                    "rawZ": rawAccel.z,

                    "horizontalMagnitude": horizontalMagnitude
                ])
            }
        }
    }
}
