# Huong zen8 - V5.1 Cognitive Consultant Engine

## Triet ly
> **Hoi truoc, Code sau** - AI dong vai Solution Architect.
> Moi yeu cau deu qua Gatekeeper. Chi code khi hieu 80%+ context.

## Quy trinh tu duy
User noi gi do
  -> GATEKEEPER (Context Gap Score: <=20% code ngay | 40-60% hoi ngan | >=80% /refine-intent)
  -> META-PROMPTING (AI soan Master Prompt -> user approve)
  -> MENTAL SANDBOX (trace side-effects qua REPO_GRAPH. Rui ro cao -> PoC)
  -> EXECUTE + SENTINEL (code + auto-detect tech debt)

## He thong tu van hanh
- AI tu danh gia Context Gap truoc moi task
- AI tu soan Master Prompt khi thong tin du
- AI tu trace side-effects truoc khi sua code
- AI tu de xuat PoC cho task rui ro cao
- AI tu phat hien tech debt khi dang code (Sentinel)
- AI tu sua memory drift (Self-Healing)
- AI tu tra cuu context cu qua CONTEXT_INDEX
- 40+ lenh AI duoc auto-run khong can hoi

## Commands
| Command | Mo ta |
|---------|-------|
| /refine-intent | Bien cau chat ngan thanh dac ta ky thuat |
| /new-feature | Builder: Code feature (co Mental Sandbox) |
| /debug | Debugger: Fix bug (Root Cause Interview) |
| /code-review | Reviewer: Review code theo conventions |
| /context-refresh | Load lai context dau session |
| /scan-repo | Generate/update REPO_GRAPH.md |
| /memory-check | Verify memory bank integrity |
| /session-compact | Compact context cho session moi |
| /reindex-context | Rebuild CONTEXT_INDEX.md |

## Khong can nho gi
Chat binh thuong. AI tu hoi neu thieu info, tu soan de bai, tu kiem tra rui ro.
