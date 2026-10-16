#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SkystrikeHUD.generated.h"

// 工程预览 HUD 显示实际渲染模式，不能把插件存在误报为 DLSS 已启用。
UCLASS()
class SKYSTRIKENATIVE_API ASkystrikeHUD : public AHUD {
 GENERATED_BODY()
public:
 virtual void DrawHUD() override;
private:
 float SmoothedFrameMs=0;
};
