# 걷는 사람 파티클 구현 기록

## 목표

파티클 클라우드로 사람이 걷는 모습을 표현. 기존 GLB 파티클 시스템(정적 shape 간 모핑)에 동적 애니메이션을 추가.

## 조사한 방법

### 방법 1: 프로시저럴 FK (Forward Kinematics)

코드에서 직접 관절 계층구조를 정의하고, sin/cos 함수로 각 관절의 회전을 계산하여 걷는 동작을 생성.

**구현 방식:**
- 관절 계층: hip → torso → chest → neck → head, chest → arms, hip → legs
- 각 관절에 `joint` (부모 기준 상대 위치) + `center` (파티클 분포 중심) 정의
- 걷기 사이클: `sin(time * speed)` 기반으로 각 관절의 회전각 계산
- 파티클: 각 신체 부위별 박스/실린더 분포 → 관절 변환 적용

**장점:**
- 외부 에셋 불필요 (코드만으로 구현)
- 파일 크기 매우 작음
- 완전한 파라미터 제어 가능

**단점:**
- 자연스러운 걸음걸이 구현이 매우 어려움
- 관절 분리, 부자연스러운 팔/다리 움직임 등 지속적 튜닝 필요
- 미세한 신체 움직임(골반 틸트, 척추 비틀림, 어깨 흔들림) 표현 한계
- 디자이너가 아닌 개발자가 자연스러운 모션을 만들기 어려움

**결론: 폐기** — 기본적인 걸음걸이는 구현 가능하나 자연스러움에 한계. 외부 모션 데이터 활용이 효율적.

### 방법 2: Mixamo FBX + SkinnedMesh (채택)

Adobe Mixamo에서 걷기 애니메이션이 포함된 FBX 파일을 다운로드하고, Three.js의 SkinnedMesh에서 매 프레임 스킨드 버텍스를 추출하여 파티클 위치로 사용.

**구현 방식:**
- Mixamo에서 Walking 애니메이션 다운로드 (FBX 포맷)
- `FBXLoader`로 런타임 로드
- `AnimationMixer`로 애니메이션 재생 (root motion 제거)
- 매 프레임 `applyBoneTransform()`으로 스킨드 버텍스 위치 추출
- 추출된 위치를 ParticleMorpher의 shape target positions에 직접 기록

**장점:**
- 프로 수준의 자연스러운 걸음걸이 (모션 캡처 기반)
- Mixamo 라이브러리에서 다양한 모션 즉시 교체 가능
- 기존 파티클 시스템(마우스 인터랙션, 스크롤 전환 등)과 완전 호환

**단점:**
- FBX 파일 크기가 큼 (~34MB, Walking.fbx)
- 매 프레임 CPU에서 ~14,000개 버텍스의 bone transform 계산 (성능 비용)
- FBXLoader 번들 크기 증가

**결론: 채택** — 자연스러움과 기존 시스템 통합 용이성에서 압도적 우위.

### 방법 3: GLB 애니메이션 (미시도)

Blender에서 FBX를 GLB로 변환 후 기존 GLB 파이프라인 활용. Mixamo는 GLB 직접 다운로드를 지원하지 않아 Blender 변환이 필요.

**예상 장점:**
- 기존 빌드타임 버텍스 추출 파이프라인과 일관성
- Draco 압축으로 파일 크기 최적화 가능
- 다만 애니메이션은 런타임 재생 필요

**미시도 이유:**
- Blender 변환 과정 추가 필요
- FBX 직접 로드가 바로 동작하여 우선순위 낮음

### 방법 4: 사전 베이크 (Pre-baked Frames, 미시도)

걷기 애니메이션의 N프레임을 사전 추출하여 바이너리로 저장하고, 런타임에 프레임 간 보간.

**예상 장점:**
- 런타임 bone transform 계산 제거 (성능 최적화)
- FBXLoader 번들 불필요
- 프레임 수 × 14,000 × 12바이트 (30프레임 ≈ 5MB)

**미시도 이유:**
- 현재 FBX 런타임 방식으로 성능 문제 없음
- 추후 성능 최적화 필요시 고려

## 최종 구현 아키텍처

### 독립 뷰어 (human.html)

```
FBXLoader → SkinnedMesh (invisible) + AnimationMixer
                                          ↓ 매 프레임
                              updateParticles():
                                fromBufferAttribute() → applyBoneTransform()
                                → applyMatrix4(matrixWorld) → particlePositions[]
                                          ↓
                              THREE.Points (BufferAttribute.needsUpdate)
```

- OrbitControls로 자유 카메라
- 사이드뷰 기본 (camera z=0, x=300)
- 10,000 파티클 사용

### ParticleMorpher 통합 (experiment.html)

```
loadFBXWalking():
  FBXLoader → SkinnedMesh + AnimationMixer + sampleIndices + normalizeScale
  → 초기 프레임 positions → ModelData.precomputedPositions
                                          ↓
ParticleMorpher.loadShapes():
  precomputedPositions → shapeTarget.positions (8유닛 정규화 + scale)
                                          ↓
morpher.setShapeUpdater(3, callback):
  매 프레임 mixer.update(delta)
  → skeleton.update()
  → per-vertex: fromBufferAttribute → applyBoneTransform → matrixWorld
  → positions × finalScale → shapeTarget.positions 덮어쓰기
                                          ↓
ParticleMorpher.update():
  shapeUpdaters 호출 → positions 읽기 → 마우스/전환/회전 적용 → GPU 업로드
```

## 핵심 기술 노트

### applyBoneTransform 사용법

Three.js r159+에서 `boneTransform()` → `applyBoneTransform()`으로 이름 변경.
반드시 `fromBufferAttribute()`로 rest pose 위치를 먼저 설정한 후 호출:

```typescript
target.fromBufferAttribute(posAttr, vertIdx);  // 필수: rest pose 로드
mesh.applyBoneTransform(vertIdx, target);       // bone 가중치 적용
target.applyMatrix4(mesh.matrixWorld);           // 월드 좌표 변환
```

`fromBufferAttribute()` 없이 호출하면 이전 프레임의 잔여 값이 누적되어 파티클이 발산함.

### Root Motion 제거

Mixamo 걷기 애니메이션은 Hips 본에 전진 이동이 포함됨. 제자리 걷기를 위해 Hips position 트랙의 X/Z를 0으로 설정하고 Y(수직 바운스)만 유지:

```typescript
clip.tracks.filter((track) => {
  if (track.name.endsWith('.position')) {
    const boneName = track.name.split('.')[0];
    if (boneName.includes('Hips')) {
      for (let i = 0; i < values.length; i += 3) {
        values[i] = 0;       // X (좌우)
        // values[i+1] 유지   // Y (상하 바운스)
        values[i + 2] = 0;   // Z (전후진)
      }
    }
  }
  return true;
});
```

### ParticleMorpher 비동기 로딩 주의

ParticleMorpher의 `loadShapes()`는 async이지만 constructor에서 호출되므로 즉시 완료되지 않음. shape 데이터에 접근하려면 반드시 `await morpher.ready` 후 사용:

```typescript
const morpher = sceneManager.getMorpher();
await morpher.ready;  // shape 로딩 완료 대기
const targets = morpher.getShapeTargets();  // 이제 안전
```

## 에셋 정보

| 파일 | 출처 | 크기 | 용도 |
| ---- | ---- | ---- | ---- |
| `Walking.fbx` | Adobe Mixamo | ~34MB | 걷기 애니메이션 소스 |

Mixamo 접속: Adobe 계정 로그인 → Characters에서 캐릭터 선택 → Animations에서 "Walking" 검색 → FBX 포맷 다운로드.
