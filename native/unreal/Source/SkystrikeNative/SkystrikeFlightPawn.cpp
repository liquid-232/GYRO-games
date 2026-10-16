#include "SkystrikeFlightPawn.h"
#include "Camera/CameraComponent.h"
#include "Components/InputComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/StaticMesh.h"
#include "Misc/App.h"

ASkystrikeFlightPawn::ASkystrikeFlightPawn() {
 PrimaryActorTick.bCanEverTick=true;
 USceneComponent* Root=CreateDefaultSubobject<USceneComponent>(TEXT("FlightRoot"));
 SetRootComponent(Root);
 Visual=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Visual"));
 Visual->SetupAttachment(Root);Visual->SetCollisionEnabled(ECollisionEnabled::NoCollision);
 static ConstructorHelpers::FObjectFinder<UStaticMesh> Proxy(TEXT("/Engine/BasicShapes/Cone.Cone"));
 if(Proxy.Succeeded())Visual->SetStaticMesh(Proxy.Object);
 Visual->SetRelativeScale3D(FVector(.8f,2.f,3.f));
 Visual->SetRelativeRotation(FRotator(-90,0,0));
 Arm=CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraArm"));
 Arm->SetupAttachment(Root);Arm->TargetArmLength=1100;Arm->SetRelativeRotation(FRotator(-12,0,0));
 Arm->SocketOffset=FVector(0,0,180);Arm->bDoCollisionTest=false;Arm->bEnableCameraLag=false;
 Camera=CreateDefaultSubobject<UCameraComponent>(TEXT("FlightCamera"));Camera->SetupAttachment(Arm);
 Camera->FieldOfView=65;AutoPossessPlayer=EAutoReceiveInput::Player0;
}
// 出生位置由载体自身初始化，避免依赖 GameMode 与玩家创建的先后顺序。
void ASkystrikeFlightPawn::BeginPlay(){Super::BeginPlay();ResetFlight();}
void ASkystrikeFlightPawn::SetupPlayerInputComponent(UInputComponent* Input) {
 Super::SetupPlayerInputComponent(Input);
 Input->BindAxis("MoveRight",this,&ASkystrikeFlightPawn::MoveRight);
 Input->BindAxis("MoveUp",this,&ASkystrikeFlightPawn::MoveUp);
 Input->BindAction("PauseFlight",IE_Pressed,this,&ASkystrikeFlightPawn::TogglePause);
 Input->BindAction("ResetFlight",IE_Pressed,this,&ASkystrikeFlightPawn::ResetFlight);
}
void ASkystrikeFlightPawn::MoveRight(float Value){InputAxis.X=Value;}
void ASkystrikeFlightPawn::MoveUp(float Value){InputAxis.Y=Value;}
void ASkystrikeFlightPawn::TogglePause(){bFlightPaused=!bFlightPaused;}
void ASkystrikeFlightPawn::ResetFlight(){SetActorLocation(FVector(0,0,600));FlightSeconds=0;InputAxis=FVector2D::ZeroVector;bFlightPaused=false;}
void ASkystrikeFlightPawn::Tick(float DeltaSeconds) {
 Super::Tick(DeltaSeconds);
 // 失去窗口焦点时停止推进；帧间步长按秒计算，后续碰撞系统需使用子步长。
 if(bFlightPaused||!FApp::HasFocus())return;
 const float Dt=FMath::Clamp(DeltaSeconds,0.f,.25f);
 FlightSeconds+=Dt;
 FVector Location=GetActorLocation();
 Location.X+=2600*Dt;
 Location.Y=FMath::Clamp(Location.Y+InputAxis.X*1500*Dt,-1600.f,1600.f);
 Location.Z=FMath::Clamp(Location.Z+InputAxis.Y*1500*Dt,300.f,1800.f);
 // 原型循环航道；后续完整关卡将由固定资源池滚动更新。
 if(Location.X>20000)Location.X=-20000;
 SetActorLocation(Location);
 Visual->SetRelativeRotation(FRotator(-90+InputAxis.Y*8,0,-InputAxis.X*15));
}
