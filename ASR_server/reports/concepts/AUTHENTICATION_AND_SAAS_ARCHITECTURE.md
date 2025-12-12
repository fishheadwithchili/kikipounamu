# ASR Microservice Authentication & SaaS Architecture Concept

> **Languages**: [English](AUTHENTICATION_AND_SAAS_ARCHITECTURE.md) | [简体中文](AUTHENTICATION_AND_SAAS_ARCHITECTURE.zh-CN.md)

**Date**: 2025-12-11
**Status**: Concept - Not Todo
**Context**: This ASR service acts as a node in the large workflow of TG Bot, and may become part of a SaaS service in the future.

---

## 1. Core Question

In a microservice architecture, does the ASR node itself need to implement user login and authentication logic?
- **Current Requirement**: Internal node only, called by TG Bot backend.
- **Future Requirement**: May be distributed as an open SaaS node to other developers, or build a superior routing platform.
- **Dilemma**: Should I implement user permission management inside the ASR service now?

## 2. Industry Research & Architecture Patterns

For scenarios where ASR is a workflow node, there are three main industry patterns:

### Pattern 1: API Gateway Centralized Auth (Recommended) ⭐

**Core Idea**:
- Handle all authentication at the upstream Unified Gateway Layer (e.g., Nginx, Kong, Traefik, or TG Bot Backend).
- Internal microservices (ASR) sit in the "Trust Zone" and focus on business logic, **No Auth**.

**Flow**:
```mermaid
graph TD
    User[User/External Dev] -->|Token/Key| Gateway[API Gateway / TG SaaS Backend]
    Gateway -->|Auth Pass| ASR[ASR Service (Pure Biz)]
    Gateway -->|Auth Fail| Reject[Reject Access]
```

**Pros**:
- **Decoupled**: ASR code remains pure, no need for complex user tables, JWT validation logic.
- **Performance**: No auth overhead for internal calls.
- **Flexible**: When opening platform in future, just add Multi-tenant or API Key logic at Gateway layer, ASR service needs no change.

### Pattern 2: Service Mesh (Zero Trust)

**Core Idea**:
- Use Istio/Linkerd etc. service mesh to enforce mTLS encryption and identity verification for all inter-service communication.
- **Evaluation**: Extremely secure, but high ops cost for Kubernetes and Sidecar proxies, considered **Over-design** for current stage.

### Pattern 3: Network Isolation (Minimal Loop)

**Core Idea**:
- ASR service only listens on intranet port (e.g., Docker Network), not exposed to public.
- Rely on network firewall for security.

## 3. Decision Conclusion

**Current Stage (Internal Node)**:
1.  **ASR Code Zero Auth**: No `Login`, `User`, `Token` logic in code.
2.  **Rely on Upstream**: All user identity, permission management fully handled by **TG Bot Backend**.
3.  **Security Measures**: Ensure ASR service is only accessible within Docker Network or VPC, strictly forbid exposing port 8000 to public.

**Future Stage (SaaS Platform)**:
1.  **Introduce Gateway**: Set up Nginx or Pro API Gateway in front of ASR.
2.  **Gateway Auth**: Implement API Key validation, billing, rate limiting at Gateway layer.
3.  **Multi-tenant Isolation**: ASR service can receive `X-Tenant-ID` or `X-User-ID` headers passed by Gateway for logging, but still not responsible for auth logic.

## 4. Summary

Industry best practice is to move auth logic up to the Gateway or Aggregation layer, keeping underlying microservices (ASR) stateless and pure. This aligns with "Separation of Concerns" principle and leaves maximum flexibility for future expansion.
