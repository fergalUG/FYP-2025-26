import CoreMotion
import ExpoModulesCore

public class VehicleMotionModule: Module {
    private let motionManager = CMMotionManager()
    private let calibration = CalibrationEngine()
    
    public func definition() -> ModuleDefinition {
        Name("VehicleMotion")
        
        Events("onMotionUpdate", "onCalibrationComplete", "onCalibrationStatus")
        
        Function("startTracking") {
            startTracking()
        }
        
        Function("stopTracking") {
            motionManager.stopDeviceMotionUpdates()
        }
    }
    
    private func startTracking() {
        calibration.resetForTracking()
        
        sendEvent("onCalibrationStatus", [
            "status": "detecting",
            "message": "Detecting movement... Drive straight to calibrate",
        ])
        
        if motionManager.isDeviceMotionAvailable {
            motionManager.deviceMotionUpdateInterval = 1.0 / 50.0
            
            motionManager.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
                guard let data = data, let self = self else { return }
                
                let accel = data.userAcceleration
                let gravity = data.gravity
                let attitude = data.attitude
                
                if self.calibration.isCalibrating {
                    self.calibration.handleAutoCalibration(
                        accel: accel,
                        gravity: gravity,
                        attitude: attitude,
                        onStatus: { status, message, progress in
                            self.sendEvent("onCalibrationStatus", [
                                "status": status,
                                "message": message,
                                "progress": progress as Any
                            ])
                        },
                        onComplete: { payload in
                            self.sendEvent("onCalibrationComplete", payload)
                        }
                    )
                }
                
                let transformedAccel = self.calibration.applyRotation(
                    x: accel.x,
                    y: accel.y,
                    z: accel.z
                )
                
                self.sendEvent("onMotionUpdate", [
                    "x": transformedAccel.x,
                    "y": transformedAccel.y,
                    "z": transformedAccel.z,
                    "pitch": attitude.pitch,
                    "roll": attitude.roll,
                    "yaw": attitude.yaw,
                    "isCalibrated": self.calibration.hasCalibration,
                ])
            }
        }
    }
}
