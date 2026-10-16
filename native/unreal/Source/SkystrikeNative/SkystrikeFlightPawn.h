#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "SkystrikeFlightPawn.generated.h"

class UStaticMeshComponent;
class USpringArmComponent;
class UCameraComponent;

// 工程阶段的飞行载体：验证原生输入、镜头和真实时间步进。
// 现用几何代理；导入原飞机后可在蓝图中替换 Visual 网格并校准朝向。
UCLASS()
class SKYSTRIKENATIVE_API ASkystrikeFlightPawn : public APawn {
 GENERATED_BODY()
public:
 ASkystrikeFlightPawn();
 virtual void BeginPlay() override;
 virtual void Tick(float DeltaSeconds) override;
 virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
 bool IsFlightPaused() const { return bFlightPaused; }
 float GetFlightSeconds() const { return FlightSeconds; }
 UPROPERTY(VisibleAnywhere,BlueprintReadOnly,Category="Aircraft") TObjectPtr<UStaticMeshComponent> Visual;
private:
 void MoveRight(float Value);
 void MoveUp(float Value);
 void TogglePause();
 void ResetFlight();
 UPROPERTY() TObjectPtr<USpringArmComponent> Arm;
 UPROPERTY() TObjectPtr<UCameraComponent> Camera;
 FVector2D InputAxis=FVector2D::ZeroVector;
 float FlightSeconds=0;
 bool bFlightPaused=false;
};
