// Spider Bro: an original BroForge character.
// Baseline: BroMaker's IndianaBronesM adapter (whip/rope swing physics are inherited and re-mapped).
//   Tap fire      -> two damaging web pellets, one from each hand.
//   Hold fire     -> web line to terrain overhead, swing with Indiana's rope physics.
//   Release       -> detach and launch forward with extra momentum.
//   Special       -> Spider Sense: ~5 s of invulnerability, automatic dodge poses, flashing halo.
using System;
using System.Collections.Generic;
using System.Reflection;
using BroMakerLib;
using BroMakerLib.Loggers;
using BroMakerLib.Vanilla.Bros;
using UnityEngine;

namespace WorkshopBros
{
    [HeroPreset("Workshop_spider_bro", HeroType.IndianaBrones)]
    public class Workshop_spider_bro : IndianaBronesM
    {
        // ---- Tunables -------------------------------------------------------------------------
        public float webHoldThreshold = 0.2f;     // seconds of holding fire before it becomes a swing
        public float webShotSpeed = 420f;
        public float webShotRange = 320f;
        public int webShotDamage = 3;            // normal bullet damage per pellet
        public float webShotCooldown = 0.28f;
        public float launchBoostX = 140f;         // extra forward speed on swing release
        public float launchBoostY = 110f;         // extra lift on swing release
        public float spiderSenseDuration = 5f;
        public float dodgeSenseRadius = 34f;      // enemy projectiles inside this radius trigger a dodge
        public bool debugEventLog = false;         // writes [SpiderBro] lines to the UMM log for playtest evidence
        public float debugSpiderSenseDelay = 0f;  // test-only: >0 triggers Spider Sense this many seconds after spawn
        private float debugSenseAt = -1f;

        // ---- State ----------------------------------------------------------------------------
        private float firePressTime = -1f;
        private bool holdBecameSwing;
        private float lastWebShotTime = -10f;
        private float webAimY;
        private bool wasAttachedLastFrame;
        private bool groundedOnWebLastFrame;
        private float spiderSenseTime;
        private float dodgePoseTime;
        private int dodgePoseIndex;
        private float dodgeSide = 1f;
        private float lastDodgeTime = -10f;
        private SpiderFx haloFx;
        private Material webShotMat, haloMat;
        private bool webLineStyled;
        private SpiderVisual bodyVisual;
        private float firePoseUntil, rescuePoseUntil;
        private float meleeWorldHitAt = -1f;
        private bool meleeAimedDown;
        private static readonly FieldInfo NativeMeleeWallHit = typeof(IndianaBrones).GetField("wallHasHit", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
        private static readonly FieldInfo NativeMeleeForwardHit = typeof(IndianaBrones).GetField("wallHasHitForward", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
        public int WebVolleys { get; private set; }
        public int WebPellets { get; private set; }
        public int WebHits { get; private set; }
        public int WebKills { get; private set; }
        public int WorldHits { get; private set; }
        public string LastWebTarget { get; private set; }
        public string VisualPose { get { return bodyVisual == null ? "None" : bodyVisual.PoseName; } }
        public int VisualFrame { get { return bodyVisual == null ? -1 : bodyVisual.CurrentFrame; } }

        public bool SpiderSenseActive { get { return spiderSenseTime > 0f; } }

        protected override void Start()
        {
            base.Start();
            try
            {
                CopyIndianaRuntimeSettings();
                webShotMat = LoadMat("web_shot.png");
                haloMat = LoadMat("spider_sense.png");
                materialArmless = LoadMat("spider_armless.png");
                materialNormal = LoadMat("spider_anim.png");
                currentMaterial = materialNormal;
                disarmedGunMaterial = LoadMat("spider_grab.png");
                gunMaterial = LoadMat("spider_gun.png");
                gunSprite.meshRender.sharedMaterial = gunMaterial;
                Material webRope = LoadMat("web_rope.png");
                if (whipSprite != null && webRope != null) whipSprite.meshRender.sharedMaterial = webRope;
                StyleWebLine();
                GameObject body = new GameObject("SpiderBroBody");
                bodyVisual = body.AddComponent<SpiderVisual>();
                bodyVisual.Init(LoadMat("spider_moves.png"));
                rescuePoseUntil = Time.time + 0.45f;
                if (debugSpiderSenseDelay > 0f) debugSenseAt = Time.time + debugSpiderSenseDelay;
                Log("spawned; materials web=" + (webShotMat != null) + " halo=" + (haloMat != null) + " webLine=" + webLineStyled);
            }
            catch (Exception e)
            {
                BMLogger.ExceptionLog(e);
            }
        }

        private void CopyIndianaRuntimeSettings()
        {
            // The adapter copies references, but not Indiana's serialized physics.
            // Constructor defaults are substantially different from the live prefab.
            IndianaBrones source = HeroController.GetHeroPrefab(HeroType.IndianaBrones).GetComponent<IndianaBrones>();
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            foreach (string name in new[] { "rotationGravity", "rotationSwingForce", "rotationDrag",
                "whipSwingLengthChangeSpeed", "velocityToRopeAngularVelocityRatio", "jumpSwingRotationSpeed",
                "jumpIntoSwingPullupSpeed", "whipClimbSpeed", "anglePenaltyValue", "minWhipRange", "whipRange", "useNewWhipLogic" })
            {
                FieldInfo field = typeof(IndianaBrones).GetField(name, flags);
                if (field != null) field.SetValue(this, field.GetValue(source));
            }
            // Indiana advances its private melee clock only through this path.
            // Without the prefab flag a punch can remain in doingMelee forever,
            // skipping the impact frame and preventing later firing input.
            FieldInfo meleeClock = typeof(TestVanDammeAnim).GetField("canDoIndependentMeleeAnimation", flags);
            if (meleeClock != null) meleeClock.SetValue(this, meleeClock.GetValue(source));
        }

        public void RecordWorldHit() { WorldHits++; }

        protected override void StartKnifeMelee()
        {
            bool crouching = down;
            bool alreadyMeleeing = doingMelee;
            base.StartKnifeMelee();
            if (!alreadyMeleeing && doingMelee && health > 0)
            {
                meleeAimedDown = crouching;
                meleeWorldHitAt = Time.time + 0.10f;
            }
        }

        protected override void AnimateMelee()
        {
            // Keep native enemy hits and timing, but replace its broad terrain
            // circles, which can clip floor tiles during a standing punch.
            NativeMeleeWallHit.SetValue(this, true);
            NativeMeleeForwardHit.SetValue(this, true);
            base.AnimateMelee();
        }

        protected override bool TryMeleeTerrain(int damage, int range) { return false; }

        private void DamageMeleeTerrain(float x, float y)
        {
            Block block = Map.GetBlock(new Vector2(x, y));
            if (block == null || !Map.IsBlockSolid(Map.GetCollumn(x), Map.GetRow(y))) return;
            MapController.Damage_Networked(this, block.gameObject, 8, DamageType.Melee,
                Mathf.Sign(transform.localScale.x) * 150f, 60f, x, y);
            RecordWorldHit();
        }

        private void DamageMeleeProps()
        {
            bool stop;
            float direction = Mathf.Sign(transform.localScale.x);
            // Standing punches hit the tile ahead at chest height. Only a
            // crouched punch can target the supporting tile beneath the feet.
            DamageMeleeTerrain(X + direction * 16f, Y + 8f);
            if (meleeAimedDown) DamageMeleeTerrain(X, Y - 4f);
            // Doodads have a separate registration path.
            if (Map.DamageDoodads(8, DamageType.Melee, X + direction * 12f, Y + 9f,
                direction * 150f, 60f, 8f, playerNum, out stop, this))
                RecordWorldHit();
        }

        public void Log(string msg)
        {
            if (debugEventLog) BMLogger.Log("[SpiderBro] " + msg);
        }

        private Material LoadMat(string file)
        {
            if (Info == null || string.IsNullOrEmpty(Info.path)) return null;
            Material m = ResourcesController.GetMaterial(Info.path, file);
            if (m != null && m.mainTexture != null)
            {
                m.name = "SpiderBro/" + file;
                m.mainTexture.name = file;
                m.mainTexture.filterMode = FilterMode.Point;
            }
            return m;
        }

        // Indiana's whip line becomes a white web strand.
        private void StyleWebLine()
        {
            LineRenderer lr = GetComponentInChildren<LineRenderer>(true);
            if (lr == null) return;
            Material strand = LoadMat("web_line.png");
            if (strand != null) lr.sharedMaterial = strand;
            lr.startColor = new Color(0.95f, 0.95f, 1f, 1f);
            lr.endColor = new Color(0.85f, 0.87f, 0.95f, 1f);
            webLineStyled = true;
        }

        // ---- Primary: tap = web shot, hold = swing ----------------------------------------------
        protected override void RunFiring()
        {
            fireDelay -= t;
            if (fire)
            {
                rollingFrames = 0;
            }
            if (health <= 0)
            {
                firePressTime = -1f;
                return;
            }
            if (fire && !wasFire)
            {
                firePressTime = Time.time;
                holdBecameSwing = false;
            }
            if (fire && firePressTime > 0f && !holdBecameSwing && Time.time - firePressTime >= webHoldThreshold)
            {
                holdBecameSwing = true;
                BeginWebSwing();
            }
            if (!fire && wasFire && firePressTime > 0f)
            {
                if (!holdBecameSwing && Time.time - lastWebShotTime >= webShotCooldown)
                {
                    ShootWeb();
                }
                firePressTime = -1f;
            }
        }

        private void BeginWebSwing()
        {
            if (whippingAnimation || whipState != WhipState.Inactive) return;
            // The inherited attach search only runs while airborne; hop up into the swing from the ground.
            if (base.actionState != ActionState.Jumping && !wallDrag && !wallClimbing)
            {
                Jump(false);
            }
            Log("hold -> web swing start (state=" + base.actionState + ")");
            base.UseFire(); // whip animation -> StartWhip() -> TryAttachToBlock() while fire is held
            FireFlashAvatar();
        }

        private void ShootWeb()
        {
            lastWebShotTime = Time.time;
            float dir = Mathf.Sign(base.transform.localScale.x);
            float ySpeed = webAimY;
            firePoseUntil = Time.time + 0.24f;
            WebVolleys++;
            SpawnWebPellet(new Vector3(base.X + dir * 9f, base.Y + 9f, base.transform.position.z - 1f), new Vector2(dir * webShotSpeed,ySpeed));
            SpawnWebPellet(new Vector3(base.X + dir * 12f, base.Y + 12f, base.transform.position.z - 1f), new Vector2(dir * webShotSpeed,ySpeed));
            if (ropeStretchSound != null)
            {
                Sound.GetInstance().PlaySoundEffectAt(ropeStretchSound, 0.45f, base.transform.position, 1.35f);
            }
            FireFlashAvatar();
            Log("dual volley; pellets=" + WebPellets + " damage=" + webShotDamage);
        }

        private void SpawnWebPellet(Vector3 origin, Vector2 velocity)
        {
            GameObject go = new GameObject("SpiderBroWebPellet");
            go.transform.position = origin;
            go.AddComponent<WebShot>().Init(this,velocity,webShotRange,webShotDamage,webShotMat,groundLayer);
            WebPellets++;
        }

        public void RecordWebHit(Unit target, int before, int after)
        {
            WebHits++;
            if (before > 0 && after <= 0) WebKills++;
            LastWebTarget = target.GetType().Name;
            Log("bullet hit " + LastWebTarget + " health " + before + " -> " + after);
        }

        private SpiderPose SelectPose()
        {
            if (health <= 0) return SpiderPose.Death;
            if (dodgePoseTime > 0f) return SpiderPose.Dodge;
            if (whipState == WhipState.Attached || whippingAnimation) return SpiderPose.Swing;
            if (Time.time < firePoseUntil) return SpiderPose.DualFire;
            if (doingMelee) return SpiderPose.Melee;
            if (wallClimbing) return SpiderPose.WallClimb;
            if (wallDrag) return SpiderPose.WallSlide;
            if (actionState == ActionState.ClimbingLadder) return SpiderPose.Ladder;
            if (actionState == ActionState.Rolling) return SpiderPose.Roll;
            if (actionState == ActionState.Hanging) return SpiderPose.Zipline;
            if (actionState == ActionState.Recalling) return SpiderPose.Recall;
            if (actionState == ActionState.Victory || actionState == ActionState.Taunting) return SpiderPose.Flex;
            if (highFive || holdingHighFive) return SpiderPose.HighFive;
            if (actionState == ActionState.Jumping) return yI > 0f ? SpiderPose.Jump : SpiderPose.Fall;
            if (Time.time < rescuePoseUntil) return SpiderPose.Rescue;
            if (down) return Mathf.Abs(xI) > 8f ? SpiderPose.CrouchRun : SpiderPose.Crouch;
            return Mathf.Abs(xI) > 8f ? SpiderPose.Run : SpiderPose.Idle;
        }

        // ---- Swing release: launch with momentum -------------------------------------------------
        protected override void LateUpdate()
        {
            bool attachedBefore = whipState == WhipState.Attached;
            bool airborneBefore = !groundedOnWebLastFrame && actionState == ActionState.Jumping && Y > groundHeight + 4f;
            base.LateUpdate();
            // Keep aim from the held input; the adapter clears directional
            // input temporarily during its firing update.
            if (fire) webAimY = up ? webShotSpeed * 0.55f : (down ? -webShotSpeed * 0.45f : 0f);
            if (!webLineStyled) StyleWebLine();
            bool attachedNow = whipState == WhipState.Attached;
            if (attachedNow && !wasAttachedLastFrame) Log("web attached to terrain at " + whipHitPoint.x.ToString("0") + "," + whipHitPoint.y.ToString("0"));
            // A bonus is only for an intentional airborne release. Landing,
            // anchor loss and jumping from an extended rope on the floor must
            // not create the extra forward/upward launch.
            if (attachedBefore && !attachedNow && !fire && airborneBefore && health > 0 && base.actionState == ActionState.Jumping)
            {
                float dir = Mathf.Abs(xI) > 15f ? Mathf.Sign(xI) : Mathf.Sign(base.transform.localScale.x);
                xI += dir * launchBoostX;
                yI = Mathf.Max(yI, 0f) + launchBoostY;
                Log("swing release launch xI=" + xI.ToString("0") + " yI=" + yI.ToString("0"));
            }
            wasAttachedLastFrame = attachedNow;
            groundedOnWebLastFrame = attachedNow && (actionState != ActionState.Jumping || Y <= groundHeight + 4f);
            // Indiana owns physics; the complete prototype-3 bank owns body artwork.
            if (bodyVisual != null)
            {
                sprite.meshRender.enabled = false;
                if (gunSprite != null) gunSprite.meshRender.enabled = false;
                bodyVisual.Render(SelectPose(),new Vector3(base.X,base.Y+15f,base.transform.position.z-0.2f),Mathf.Sign(transform.localScale.x));
            }
        }

        // ---- Special: Spider Sense ------------------------------------------------------------------
        protected override void PressSpecial()
        {
            if (hasBeenCoverInAcid || health <= 0 || SpiderSenseActive || SpecialAmmo <= 0) return;
            SpecialAmmo--;
            TriggerBroSpecialEvent();
            spiderSenseTime = spiderSenseDuration;
            SetInvulnerable(spiderSenseDuration, false, false);
            if (soundHolder != null && soundHolder.special2Sounds != null && soundHolder.special2Sounds.Length > 0)
            {
                Sound.GetInstance().PlaySoundEffectAt(soundHolder.special2Sounds, 0.35f, base.transform.position, 1.6f);
            }
            if (haloFx == null && haloMat != null)
            {
                GameObject go = new GameObject("SpiderSenseHalo");
                haloFx = go.AddComponent<SpiderFx>();
                haloFx.Init(haloMat, 32f, 32f);
            }
            if (haloFx != null) haloFx.gameObject.SetActive(true);
            TriggerDodge(base.X + Mathf.Sign(base.transform.localScale.x) * 10f);
            Log("Spider Sense ON for " + spiderSenseDuration + "s; ammo left " + SpecialAmmo + "; halo=" + (haloFx != null));
        }

        protected override void Update()
        {
            base.Update();
            if (meleeWorldHitAt >= 0f && Time.time >= meleeWorldHitAt)
            {
                meleeWorldHitAt = -1f;
                if (health > 0 && doingMelee) DamageMeleeProps();
            }
            if (debugSenseAt > 0f && Time.time >= debugSenseAt && health > 0)
            {
                debugSenseAt = -1f;
                Log("debug: triggering Spider Sense via PressSpecial()");
                PressSpecial();
            }
            if (spiderSenseTime > 0f)
            {
                spiderSenseTime -= Time.deltaTime;
                if (spiderSenseTime <= 0f) Log("Spider Sense OFF; invulnerable=" + invulnerable);
                if (health <= 0) spiderSenseTime = 0f;
                if (spiderSenseTime > 0f)
                {
                    // Keep the invulnerability window aligned with the remaining spider sense.
                    SetInvulnerable(spiderSenseTime, false, false);
                    SenseIncomingProjectiles();
                }
            }
            if (dodgePoseTime > 0f) dodgePoseTime -= Time.deltaTime;
            UpdateHalo();
        }

        private void UpdateHalo()
        {
            if (haloFx == null) return;
            if (!SpiderSenseActive)
            {
                if (haloFx.gameObject.activeSelf) haloFx.gameObject.SetActive(false);
                return;
            }
            // Flashing: blink at ~10 Hz, pulse outward from the head; faster in the final second.
            float rate = spiderSenseTime < 1f ? 22f : 11f;
            bool on = Mathf.Repeat(Time.time * rate, 1f) < 0.62f;
            float pulse = 0.8f + 0.45f * Mathf.Repeat(Time.time * 2.6f, 1f);
            haloFx.SetVisible(on);
            haloFx.transform.position = new Vector3(base.X, base.Y + 22f + pulse * 3f, base.transform.position.z - 2f);
            haloFx.transform.localScale = new Vector3(pulse, pulse, 1f);
        }

        private void SenseIncomingProjectiles()
        {
            if (Map.projectiles == null || Time.time - lastDodgeTime < 0.35f) return;
            for (int i = Map.projectiles.Count - 1; i >= 0; i--)
            {
                Projectile p = Map.projectiles[i];
                if (p == null || p.playerNum >= 0) continue; // enemy projectiles have negative player numbers
                float dx = p.X - base.X, dy = p.Y - (base.Y + 8f);
                if (dx * dx + dy * dy < dodgeSenseRadius * dodgeSenseRadius)
                {
                    TriggerDodge(p.X);
                    Log("dodge pose " + dodgePoseIndex + " vs projectile " + p.name);
                    return;
                }
            }
        }

        private void TriggerDodge(float threatX)
        {
            lastDodgeTime = Time.time;
            dodgePoseTime = 0.3f;
            dodgePoseIndex = (dodgePoseIndex + 1) % 3;
            dodgeSide = threatX >= base.X ? -1f : 1f; // lean away from the threat
        }

        public override void Damage(int damage, DamageType damageType, float xI, float yI, int direction, MonoBehaviour damageSender, float hitX, float hitY)
        {
            if (SpiderSenseActive && health > 0 && damageType != DamageType.SelfEsteem)
            {
                TriggerDodge(hitX);
                Log("Spider Sense blocked " + damage + " " + damageType + " damage (dodge pose " + dodgePoseIndex + ")");
                return;
            }
            base.Damage(damage, damageType, xI, yI, direction, damageSender, hitX, hitY);
        }

        // Dodge poses reuse the inherited roll-row frames with a lean-away offset.
        private static readonly int[] DodgeColumns = { 22, 25, 28 };

        protected override void ChangeFrame()
        {
            base.ChangeFrame();
            if (dodgePoseTime > 0f && health > 0 && whipState != WhipState.Attached && !whippingAnimation)
            {
                DeactivateGun();
                sprite.SetLowerLeftPixel(DodgeColumns[dodgePoseIndex] * spritePixelWidth, spritePixelHeight * 2);
                SetSpriteOffset(dodgeSide * 3f, 1f);
            }
            else if (dodgePoseTime <= 0f && dodgePoseTime > -1f && health > 0 && !usingSpecial && !whippingAnimation)
            {
                dodgePoseTime = -1f;
                ActivateGun();
            }
        }

        public override void Death(float xI, float yI, DamageObject damage)
        {
            spiderSenseTime = 0f;
            if (haloFx != null) haloFx.gameObject.SetActive(false);
            base.Death(xI, yI, damage);
        }

        protected override void OnDestroy()
        {
            if (haloFx != null) Destroy(haloFx.gameObject);
            if (bodyVisual != null)
            {
                if (health <= 0) bodyVisual.DetachDeath();
                else Destroy(bodyVisual.gameObject);
            }
            base.OnDestroy();
        }
    }

    // Simple textured quad used for web and halo effects.
    public class SpiderFx : MonoBehaviour
    {
        private MeshRenderer meshRenderer;
        private Mesh mesh;
        private Vector2[] atlasUv = new Vector2[4];

        public void Init(Material mat, float w, float h)
        {
            MeshFilter mf = gameObject.AddComponent<MeshFilter>();
            meshRenderer = gameObject.AddComponent<MeshRenderer>();
            mesh = new Mesh();
            float hw = w / 2f, hh = h / 2f;
            mesh.vertices = new[] { new Vector3(-hw, -hh, 0f), new Vector3(hw, -hh, 0f), new Vector3(hw, hh, 0f), new Vector3(-hw, hh, 0f) };
            mesh.uv = new[] { new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(1f, 1f), new Vector2(0f, 1f) };
            mesh.triangles = new[] { 0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3 }; // double-sided
            mesh.RecalculateBounds();
            mf.mesh = mesh;
            meshRenderer.sharedMaterial = mat;
            meshRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            meshRenderer.receiveShadows = false;
        }

        public void SetAtlasFrame(int column, int row, int columns, int rows)
        {
            float x0=(float)column/columns, x1=(float)(column+1)/columns;
            float y0=1f-(float)(row+1)/rows, y1=1f-(float)row/rows;
            atlasUv[0]=new Vector2(x0,y0);atlasUv[1]=new Vector2(x1,y0);
            atlasUv[2]=new Vector2(x1,y1);atlasUv[3]=new Vector2(x0,y1);
            mesh.uv=atlasUv;
        }

        private void OnDestroy() { if (mesh != null) Destroy(mesh); }

        public void SetVisible(bool v)
        {
            if (meshRenderer != null) meshRenderer.enabled = v;
        }
    }

    // Two independent, swept-collision web pellets deal native bullet damage.
    public class WebShot : MonoBehaviour
    {
        private Workshop_spider_bro owner;
        private Vector2 velocity;
        private float rangeLeft, age;
        private int damage;
        private LayerMask ground;
        private bool damagedDoodad;

        public void Init(Workshop_spider_bro hero, Vector2 speed, float range, int hitDamage, Material material, LayerMask terrain)
        {
            owner=hero;velocity=speed;rangeLeft=range;damage=hitDamage;
            ground=(int)terrain | LayerMask.GetMask("Ground", "LargeObjects", "FLUI", "MobileBarriers", "IndestructibleGround", "DirtyHippie");
            if (material != null) gameObject.AddComponent<SpiderFx>().Init(material,6f,6f);
        }

        private static bool ClipAxis(float origin,float step,float min,float max,ref float enter,ref float exit)
        {
            if (Mathf.Abs(step)<0.0001f) return origin>=min && origin<=max;
            float a=(min-origin)/step,b=(max-origin)/step;
            if (a>b) { float swap=a;a=b;b=swap; }
            enter=Mathf.Max(enter,a);exit=Mathf.Min(exit,b);
            return enter<=exit;
        }

        private static float HitFraction(Vector3 from,Vector3 step,Unit unit)
        {
            float enter=0f,exit=1f;
            if (!ClipAxis(from.x,step.x,unit.X-unit.width-2f,unit.X+unit.width+2f,ref enter,ref exit)) return 2f;
            if (!ClipAxis(from.y,step.y,unit.Y-2f,unit.Y+unit.height*2f+2f,ref enter,ref exit)) return 2f;
            return enter;
        }

        private void Update()
        {
            if (owner == null) { Destroy(gameObject);return; }
            float dt=Mathf.Min(Time.deltaTime,0.05f);age+=dt;
            if (age>3f) {Destroy(gameObject);return;}
            Vector3 from=transform.position;
            Vector3 step=new Vector3(velocity.x,velocity.y,0f)*dt;
            float dist=Mathf.Min(step.magnitude,rangeLeft);
            if (dist<0.001f) {Destroy(gameObject);return;}
            step=step.normalized*dist;
            // Walls occlude mooks, including when a fast pellet crosses both in one frame.
            RaycastHit wall;bool blocked=Physics.Raycast(new Vector3(from.x,from.y,0f),step/dist,out wall,dist,ground);
            float nearest=blocked ? wall.distance/dist : 1.0001f;
            // Floor tiles can have no active raycast face. Check the native
            // foreground grid as well, keeping the nearest obstacle first.
            Block gridBlock=null;
            int terrainSamples=Mathf.Max(1,Mathf.CeilToInt(dist/2f));
            for (int i=0;i<=terrainSamples;i++)
            {
                float fraction=(float)i/terrainSamples;
                if (fraction>=nearest) break;
                Vector3 p=from+step*fraction;
                int column=Map.GetCollumn(p.x),row=Map.GetRow(p.y);
                if (!Map.IsBlockSolid(column,row)) continue;
                Block candidate=Map.GetBlock(column,row);
                if (candidate==null) continue;
                gridBlock=candidate;nearest=fraction;break;
            }
            Unit target=null;
            if (Map.units != null) for (int i=Map.units.Count-1;i>=0;i--)
            {
                Unit unit=Map.units[i];
                if (unit==null || unit==owner || unit.health<=0) continue;
                if (!GameModeController.DoesPlayerNumDamage(owner.playerNum,unit.playerNum)) continue;
                float hit=HitFraction(from,step,unit);
                if (hit<nearest) {nearest=hit;target=unit;}
            }
            // Native projectiles damage registered doodads separately from
            // colliders. Sweep that path only as far as the first wall/enemy.
            if (!damagedDoodad)
            {
                int samples=Mathf.Max(1,Mathf.CeilToInt(dist*Mathf.Min(nearest,1f)/4f));
                for (int i=0;i<=samples;i++)
                {
                    Vector3 p=from+step*(Mathf.Min(nearest,1f)*i/samples);
                    bool stop;
                    if (Map.DamageDoodads(damage,DamageType.Bullet,p.x,p.y,velocity.x,velocity.y,2f,owner.playerNum,out stop,owner))
                    {
                        damagedDoodad=true;owner.RecordWorldHit();
                        if (stop) { EffectsController.CreateProjectilePuff(p.x,p.y);Destroy(gameObject);return; }
                        break;
                    }
                }
            }
            if (target != null)
            {
                Vector3 hit=from+step*nearest;int before=target.health;
                target.Damage(damage,DamageType.Bullet,Mathf.Sign(velocity.x)*90f,20f,(int)Mathf.Sign(velocity.x),owner,hit.x,hit.y);
                owner.RecordWebHit(target,before,target.health);
                Destroy(gameObject);return;
            }
            if (gridBlock != null)
            {
                Vector3 hit=from+step*nearest;
                MapController.Damage_Networked(owner,gridBlock.gameObject,damage,DamageType.Bullet,
                    velocity.x,velocity.y,hit.x,hit.y);
                owner.RecordWorldHit();EffectsController.CreateProjectilePuff(hit.x,hit.y);
                Destroy(gameObject);return;
            }
            if (blocked)
            {
                MapController.Damage_Networked(owner,wall.collider.gameObject,damage,DamageType.Bullet,
                    velocity.x,velocity.y,wall.point.x,wall.point.y);
                owner.RecordWorldHit();
                EffectsController.CreateProjectilePuff(wall.point.x,wall.point.y);
                Destroy(gameObject);return;
            }
            transform.position=from+step;rangeLeft-=dist;
            if (rangeLeft<=0f) Destroy(gameObject);
        }
    }
}
