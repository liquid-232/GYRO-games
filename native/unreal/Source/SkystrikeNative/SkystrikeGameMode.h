#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SkystrikeGameMode.generated.h"

class UStaticMesh;

// 空白原型地图自动创建灯光和航道，仅用于原生链路验证。
UCLASS()
class SKYSTRIKENATIVE_API ASkystrikeGameMode : public AGameModeBase {
 GENERATED_BODY()
public:
 ASkystrikeGameMode();
 virtual void BeginPlay() override;
private:
 // 显式持有引擎网格，使打包收集器能找到原型航道的资源依赖。
 UPROPERTY() TObjectPtr<UStaticMesh> CourseMesh;
};
