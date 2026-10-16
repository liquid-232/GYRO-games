#include "SkystrikeHUD.h"
#include "SkystrikeFlightPawn.h"
#include "Engine/Canvas.h"
#include "Engine/World.h"
#include "DynamicRHI.h"
#include "HAL/IConsoleManager.h"
#include "GameFramework/PlayerController.h"

void ASkystrikeHUD::DrawHUD(){
 Super::DrawHUD();
 if(!Canvas)return;
 DrawText(TEXT("SKYSTRIKE NATIVE / ENGINEERING PREVIEW"),FLinearColor::White,24,24);
 DrawText(TEXT("WASD / Arrows: move | P: pause | R: reset"),FLinearColor::White,24,48);
 // 显示实际 RHI 与抗锯齿设置，避免启动参数覆盖后仍显示预设名称。
 const IConsoleVariable* AA=IConsoleManager::Get().FindConsoleVariable(TEXT("r.AntiAliasingMethod"));
 const FString AAName=AA&&AA->GetInt()==4?TEXT("TSR"):FString::Printf(TEXT("AA mode %d"),AA?AA->GetInt():-1);
 const FString RenderStatus=FString::Printf(TEXT("Renderer: %s / %s | NVIDIA DLSS integration pending"),GDynamicRHI?GDynamicRHI->GetName():TEXT("Unknown"),*AAName);
 DrawText(RenderStatus,FLinearColor(.9f,.7f,.25f),24,72);
 DrawText(TEXT("Proxy aircraft / prototype course. Full game migration pending."),FLinearColor(.7f,.8f,.9f),24,96);
 const float Dt=GetWorld()?GetWorld()->GetDeltaSeconds():0.f;
 if(Dt>0){SmoothedFrameMs=SmoothedFrameMs>0?FMath::Lerp(SmoothedFrameMs,Dt*1000.f,.08f):Dt*1000.f;}
 if(SmoothedFrameMs>0)DrawText(FString::Printf(TEXT("Render %.0f FPS / %.1f ms"),1000.f/SmoothedFrameMs,SmoothedFrameMs),FLinearColor::White,24,144);
 const ASkystrikeFlightPawn* Pawn=GetOwningPlayerController()?Cast<ASkystrikeFlightPawn>(GetOwningPlayerController()->GetPawn()):nullptr;
 if(Pawn)DrawText(FString::Printf(TEXT("Flight %.1f s %s"),Pawn->GetFlightSeconds(),Pawn->IsFlightPaused()?TEXT("PAUSED"):TEXT("")),FLinearColor::White,24,120);
}
