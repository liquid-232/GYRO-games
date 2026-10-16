#include "SkystrikeGameMode.h"
#include "SkystrikeFlightPawn.h"
#include "SkystrikeHUD.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "UObject/ConstructorHelpers.h"
#include "Components/LightComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"

ASkystrikeGameMode::ASkystrikeGameMode(){
 DefaultPawnClass=ASkystrikeFlightPawn::StaticClass();HUDClass=ASkystrikeHUD::StaticClass();
 static ConstructorHelpers::FObjectFinder<UStaticMesh> Mesh(TEXT("/Engine/BasicShapes/Cube.Cube"));
 if(Mesh.Succeeded())CourseMesh=Mesh.Object;
}
void ASkystrikeGameMode::BeginPlay(){
 Super::BeginPlay();
 UWorld* World=GetWorld();
 ADirectionalLight* Sun=World->SpawnActor<ADirectionalLight>(FVector(0,0,4000),FRotator(-35,-40,0));
 if(Sun){Sun->GetLightComponent()->SetMobility(EComponentMobility::Movable);Sun->GetLightComponent()->SetIntensity(5);}
 ASkyLight* Sky=World->SpawnActor<ASkyLight>();
 if(Sky){Sky->GetLightComponent()->SetMobility(EComponentMobility::Movable);Sky->GetLightComponent()->SetIntensity(.6f);}
 // 使用少量静态代理标记航道；两张正式地图与游戏目标尚未移植。
 for(int32 Index=0;Index<22;++Index){
  const FVector Position(Index<2?0:-19000+(Index-2)*2000,Index<2?0:((Index%2)?-2200:2200),Index<2?-100:300);
  if(Index==1)continue;
  AStaticMeshActor* Marker=World->SpawnActor<AStaticMeshActor>(Position,FRotator::ZeroRotator);
  if(!Marker)continue;
  Marker->GetStaticMeshComponent()->SetMobility(EComponentMobility::Movable);
  Marker->GetStaticMeshComponent()->SetStaticMesh(CourseMesh);
  Marker->SetActorScale3D(Index==0?FVector(500,80,1):FVector(2,2,7));
 }
}
