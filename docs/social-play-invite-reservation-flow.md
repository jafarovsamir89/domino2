# Social Play Invite / Friend Reservation Flow

**Project:** Domino  
**Status:** Product/architecture decision draft  
**Created:** 2026-06-11  
**Owner idea:** Samir Jafarov  

## 1. Short summary

The current implementation treats an invite as a **room invite**:

```text
Create room -> get roomId -> invite friend into this room -> friend joins roomId
```

This is not the desired product behavior.

The desired behavior is a **pre-room play invite / reservation flow**:

```text
Invite friend to play -> friend accepts -> friend is reserved/waiting -> inviter configures and creates room -> accepted friends are notified/join the created room
```

In this model, the invite must **not require an existing roomId**. The room may not exist yet because the inviter still needs to choose settings such as stake, player count, AI usage, game mode, visibility, and other room options.

The invite is not a direct room join. It is a social agreement to play together.

---

## 2. Why the current room invite model is wrong

During production trace, the current frontend showed this kind of state:

```json
{
  "activeRoomId": null,
  "activeRoomCode": "....",
  "activeRoomContextSource": "roomCode-only",
  "lastInviteSendPayloadSafe": {
    "roomId": null,
    "roomCode": "....",
    "inviteePlayerId": "..."
  },
  "lastInviteSendTransport": "unknown",
  "lastInviteSendError": "Active room is not ready yet"
}
```

This proved that the current invite flow expects an active `roomId` before it can send an invite. That expectation is incorrect for the intended game design.

The invite button should mean:

> “Come play with me.”

It should not mean:

> “Join this already-created room.”

The player may invite friends before the room is configured. The room is created later.

---

## 3. Desired product behavior

### 3.1 Basic flow

1. Player A opens friends/social UI.
2. Player A taps **Invite to Play** on Player B.
3. The system creates a **play invite** without a `roomId`.
4. Player B receives a notification:

```text
Samir invites you to play Domino.
[Accept] [Decline]
```

5. If Player B accepts, B becomes **reserved** for A's upcoming game.
6. Player A sees:

```text
B accepted your invite and is waiting for you to create a room.
```

7. Player A can invite up to 3 friends.
8. Accepted friends wait while Player A configures the room.
9. Player A creates the room with chosen settings.
10. The system sends a **room ready** notification to accepted friends.
11. Accepted friends can join the room, or the client can auto-join them if the UX chooses that behavior.

### 3.2 Maximum players

Domino room maximum is 4 players, so the inviter can invite up to 3 other players.

```text
Inviter A + invited B/C/D = max 4 players
```

The number of accepted reservations must be compatible with the final room settings.

Examples:

- 2-player room: only 1 accepted friend can join.
- 4-player FFA room: up to 3 accepted friends can join.
- 4-player partnership room: accepted players must be assigned into valid seats/teams.

---

## 4. Terminology

### 4.1 Current misleading term

`roomInvite` is misleading if it requires a room to already exist.

### 4.2 Better terms

Use one of these terms in code and UI:

- `playInvite`
- `partyInvite`
- `preRoomInvite`
- `friendReservation`
- `gameReservation`

Recommended internal term:

```text
Play Invite
```

Recommended concept name:

```text
Friend Reservation Flow
```

---

## 5. Core concept

A play invite is a pre-room invitation. It represents the intent:

```text
I want you to play with me in my next room.
```

It does **not** represent:

```text
Join roomId = X right now.
```

A room id is only needed after the inviter creates the actual online room.

---

## 6. Suggested data model

### 6.1 PlayInvite

A suggested model shape:

```ts
PlayInvite {
  id: string;

  inviterPlayerId: string;
  inviteePlayerId: string;

  status:
    | 'pending'
    | 'accepted'
    | 'declined'
    | 'cancelled'
    | 'expired'
    | 'room_created'
    | 'joined'
    | 'failed_to_join';

  // Optional until room is created
  roomId?: string | null;
  roomCode?: string | null;

  // Optional preview of intended settings, not required at invite time
  intendedMode?: string | null;
  intendedStake?: number | null;
  intendedMaxPlayers?: number | null;
  intendedUseAi?: boolean | null;

  createdAt: Date;
  acceptedAt?: Date | null;
  declinedAt?: Date | null;
  cancelledAt?: Date | null;
  expiredAt?: Date | null;
  roomCreatedAt?: Date | null;
  joinedAt?: Date | null;
}
```

### 6.2 Important distinction

`roomId` must be optional at invite creation time.

```text
pending/accepted invite -> roomId may be null
room_created/joined invite -> roomId should exist
```

---

## 7. Status lifecycle

Recommended lifecycle:

```text
pending
  -> accepted
  -> room_created
  -> joined
```

Alternative endings:

```text
pending -> declined
pending -> cancelled
pending -> expired
accepted -> cancelled
accepted -> expired
room_created -> failed_to_join
```

### 7.1 pending

Invite was sent. Invitee has not answered yet.

### 7.2 accepted

Invitee accepted and is waiting for the inviter to create the room.

UI text for inviter:

```text
B accepted your invite and is waiting.
```

UI text for invitee:

```text
Waiting for A to create the room...
```

### 7.3 declined

Invitee rejected the invite.

### 7.4 cancelled

Inviter cancelled the invite or started another incompatible flow.

### 7.5 expired

Invite timed out.

Recommended expiry:

```text
5-15 minutes for pending invites
10-20 minutes for accepted reservations
```

Exact values should be product-tested.

### 7.6 room_created

Inviter created the real room and the invite now has `roomId`.

### 7.7 joined

Invitee entered the created room.

### 7.8 failed_to_join

Invitee could not join due to capacity, disconnect, expired room, stake mismatch, insufficient coins, or other game constraints.

---

## 8. UX requirements

### 8.1 Inviter side

Player A should see a small reservation panel:

```text
Friends waiting for game:
B — accepted
C — pending
D — accepted
```

Actions:

```text
[Create room with friends]
[Cancel invite]
```

When opening room settings, show:

```text
Reserved players: B, D
```

If settings conflict with accepted players, show a clear warning.

Example:

```text
You selected a 2-player room, but 2 friends accepted. Only 1 friend can join this room.
```

### 8.2 Invitee side

Player B receives:

```text
Samir invites you to play Domino.
[Accept] [Decline]
```

After accepting:

```text
Waiting for Samir to create the room...
```

When room is created:

```text
Room is ready.
[Join room]
```

Auto-join can be added later, but the safer MVP is a **Join room** button.

### 8.3 Notifications

Required realtime notifications:

- invite received
- invite accepted
- invite declined
- invite cancelled
- room created / ready
- player joined
- invite expired

---

## 9. Backend/API design

### 9.1 Create play invite

```http
POST /api/social/play-invites
```

Payload:

```json
{
  "inviteePlayerId": "player_B"
}
```

Optional payload if inviter already chose rough settings:

```json
{
  "inviteePlayerId": "player_B",
  "intendedMode": "ffa",
  "intendedMaxPlayers": 4,
  "intendedStake": 100,
  "intendedUseAi": false
}
```

No `roomId` required.

### 9.2 Accept invite

```http
POST /api/social/play-invites/:inviteId/accept
```

Result:

```json
{
  "inviteId": "...",
  "status": "accepted"
}
```

### 9.3 Decline invite

```http
POST /api/social/play-invites/:inviteId/decline
```

### 9.4 Cancel invite

```http
POST /api/social/play-invites/:inviteId/cancel
```

Only inviter can cancel.

### 9.5 Attach created room to accepted invites

When inviter creates a room, after Colyseus room creation succeeds:

```http
POST /api/social/play-invites/attach-room
```

Payload:

```json
{
  "roomId": "real_colyseus_room_id",
  "roomCode": "visible_code_if_any",
  "inviteIds": ["invite_1", "invite_2"],
  "roomSettings": {
    "mode": "ffa",
    "maxPlayers": 4,
    "stake": 100,
    "useAi": false
  }
}
```

Backend validates:

- current player is inviter
- invites belong to current player
- invites are accepted
- invites are not expired/cancelled
- room capacity supports selected invites
- invited players still eligible

Then backend emits room-ready events.

### 9.6 Get active play invites

```http
GET /api/social/play-invites
```

Returns:

```json
{
  "incoming": [],
  "outgoing": [],
  "acceptedWaiting": []
}
```

---

## 10. Socket.IO events

### 10.1 Send invite

Client can call REST or Socket.IO. For consistency, REST can be primary and Socket.IO can be used for realtime delivery.

Suggested socket events:

```text
play-invite:new
play-invite:accepted
play-invite:declined
play-invite:cancelled
play-invite:expired
play-invite:room-ready
play-invite:joined
```

### 10.2 Realtime rooms

Each player socket should join:

```text
player:{playerId}
```

Invite delivery:

```text
emit to player:{inviteePlayerId} -> play-invite:new
emit to player:{inviterPlayerId} -> play-invite:accepted / declined / joined
```

Room ready:

```text
emit to player:{acceptedInviteePlayerId} -> play-invite:room-ready
```

---

## 11. Room creation integration

The room creation flow should not depend on invite existing.

The integration should be:

1. Player A configures room settings.
2. Player A creates Colyseus room.
3. Colyseus returns `roomId`.
4. Frontend/backend attaches this `roomId` to accepted play invites.
5. Backend notifies accepted players.
6. Accepted players join using `roomId` or a safe join token/code.

### 11.1 Important rule

Do not block invite creation due to missing room id.

Missing room id is expected before room creation.

---

## 12. Capacity and room settings rules

Before final room creation or room-ready notification, validate:

### 12.1 Player count

```text
maxPlayers >= 1 + acceptedInviteCount
```

If not, show warning and allow inviter to choose who to include.

### 12.2 Stake

If room has a stake, accepted players must have enough coins before joining.

If a reserved player lacks coins:

```text
status -> failed_to_join
reason -> insufficient_coins
```

### 12.3 AI usage

If AI fills empty seats, accepted friends should take priority over AI.

Example:

```text
4-player room, 2 accepted friends -> 1 inviter + 2 friends + 1 AI
```

### 12.4 Partnership mode

If partnership mode is selected, seat/team assignment must be clear.

MVP can use automatic seat assignment, but later UI should allow team/seat selection.

---

## 13. MVP implementation plan

### Phase 1 — Documentation and naming

- Freeze current roomId-based invite as legacy behavior.
- Document new Play Invite / Reservation Flow.
- Do not continue trying to fix pre-room invites through `activeRoomId`.

### Phase 2 — Backend model/API

- Add/adjust invite model so `roomId` is optional.
- Add create/accept/decline/cancel endpoints.
- Add room attach endpoint after room creation.
- Add realtime events.

### Phase 3 — Frontend UI

- Add “Invite to Play” button.
- Add incoming invite card.
- Add “accepted and waiting” state.
- Add reservation panel for inviter.
- Add “room ready / join room” card for invitee.

### Phase 4 — Room creation integration

- After successful room creation, attach room to accepted invites.
- Notify accepted invitees.
- Allow join.

### Phase 5 — Polish

- Expiration timers.
- Cancel/re-invite.
- Offline handling.
- Stake eligibility warnings.
- Seat/team assignment.
- Push/local notifications.

---

## 14. QA scenarios

### 14.1 Basic accepted invite

1. A invites B.
2. B sees invite immediately.
3. B accepts.
4. A sees “B accepted and is waiting.”
5. A creates 2-player room.
6. B receives room-ready notification.
7. B joins.

### 14.2 Multiple friends

1. A invites B, C, D.
2. B and D accept.
3. C remains pending.
4. A creates 4-player room.
5. B and D receive room-ready.
6. C does not join unless accepted before room creation or inviter includes C later.

### 14.3 Capacity conflict

1. A invites B and C.
2. Both accept.
3. A tries to create 2-player room.
4. UI warns that only one invited friend can join.
5. A selects B or changes room to 3/4 players.

### 14.4 Invite expires

1. A invites B.
2. B does not answer.
3. Invite expires.
4. A and B see expired state.

### 14.5 Invitee offline after accept

1. B accepts invite.
2. B goes offline.
3. A creates room.
4. B receives room-ready when reconnecting if invite still valid, or invite is marked failed/expired.

### 14.6 Insufficient coins

1. B accepts invite.
2. A creates room with stake.
3. B does not have enough coins.
4. B cannot join and sees reason.
5. A sees B could not join.

---

## 15. Debug requirements

The debug panel should expose safe fields:

```json
{
  "playInvite": {
    "incomingPendingCount": 0,
    "outgoingPendingCount": 0,
    "acceptedWaitingCount": 0,
    "lastInviteCreatedAt": 0,
    "lastInviteAcceptedAt": 0,
    "lastRoomReadyAt": 0,
    "lastInviteError": "",
    "selectedAcceptedInviteIds": []
  }
}
```

Do not expose:

- tokens
- cookies
- emails
- private message text

---

## 16. Non-goals

This document does not require changing:

- service worker
- matchmake transport
- Colyseus core room creation
- Better Auth
- game token logic
- economy rules
- legacy domino-server

The goal is to redesign the social invite concept, not to rewrite the game server.

---

## 17. Product decision

The Domino social invite feature should be redesigned as:

```text
Friend Play Invite -> Accepted Reservation -> Room Creation -> Room Ready -> Join
```

The invite should not require `activeRoomId` at send time.

The current roomId-based invite behavior is only useful for a separate feature:

```text
Invite friend to an already-created room
```

That can exist later, but it is not the main “invite friend to play” UX.

---

## 18. Final rule for future agents

Do not try to fix the main invite feature by forcing `activeRoomId` to exist before invite creation.

For the main social play invite flow:

```text
roomId is optional before room creation
roomId is attached only after the inviter creates the room
accepted friends are reservations, not room members yet
```
