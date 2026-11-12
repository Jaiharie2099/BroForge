using UnityEngine;

namespace WorkshopBros
{
    // Must match the named rows written by tools/build_animations.py.
    public enum SpiderPose { Idle, Run, Crouch, Jump, Fall, Swing, DualFire, WallClimb,
        Ladder, WallSlide, Roll, Dodge, Melee, Death, HighFive, Rescue, Flex, Zipline,
        Recall, CrouchRun, Special }

    public class SpiderVisual : MonoBehaviour
    {
        private static readonly int[] Counts = {4,8,4,4,4,6,4,6,6,4,8,6,6,6,6,6,6,4,6,8,6};
        private static readonly int[] Rates = {5,13,7,9,8,10,16,4,3,3,14,14,14,10,9,9,8,7,9,11,12};
        private SpiderFx quad;
        private SpiderPose pose;
        private float started;
        private bool detached;
        public string PoseName { get { return pose.ToString(); } }
        public int CurrentFrame { get; private set; }

        public void Init(Material material)
        {
            quad = gameObject.AddComponent<SpiderFx>();
            quad.Init(material,32f,32f);
            started = Time.time;
        }

        public void Render(SpiderPose next, Vector3 position, float facing)
        {
            if (detached) return;
            if (next != pose) { pose=next; started=Time.time; }
            transform.position=position;
            transform.localScale=new Vector3(facing,1f,1f);
            Frame();
        }

        private void Frame()
        {
            int row=(int)pose;
            int f=(int)((Time.time-started)*Rates[row]);
            bool once=pose==SpiderPose.Death || pose==SpiderPose.DualFire || pose==SpiderPose.Melee || pose==SpiderPose.Rescue;
            CurrentFrame=once ? Mathf.Min(f,Counts[row]-1) : f%Counts[row];
            quad.SetAtlasFrame(CurrentFrame,row,8,21);
        }

        public void DetachDeath()
        {
            detached=true;
            if (pose!=SpiderPose.Death) { pose=SpiderPose.Death;started=Time.time; }
            Frame();
            Destroy(gameObject,Mathf.Max(0.05f,0.65f-(Time.time-started)));
        }

        private void Update() { if (detached) Frame(); }
    }
}
