import { Injectable, inject } from '@angular/core';
import { Auth, authState, signInAnonymously, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, User, getRedirectResult } from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc, updateDoc, onSnapshot, Unsubscribe } from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  avatar: string;
  coins: number;
  stats: {
    mahjong?: {
      totalGamesPlayed: number;
      totalWins: number;
      totalFanWon: number;
      currentWinStreak?: number;
      highestWinStreak?: number;
      highestCoinWin?: number;
      highestCoinLose?: number;
      baoCount?: number;
      selfPickWins?: number;
      discardWins?: number;
      contractPenaltyCount?: number;
      totalCoinsGained?: number;
      totalCoinsLost?: number;
      robbingKongCount?: number;
      fourJokersCount?: number;
      tianHuCount?: number;
      diHuCount?: number;
      seasonsSetCount?: number;
      gentlemenSetCount?: number;
      greatFourWindsCount?: number;
      littleFourWindsCount?: number;
      greatThreeDragonsCount?: number;
      littleThreeDragonsCount?: number;
      allCircleCount?: number;
      allHonorsCount?: number;
      huaShangCount?: number;
      gangShangCount?: number;
      hiddenTreasureCount?: number;
      pongPongHandCount?: number;
      sevenPairsCount?: number;
      pingHuCount?: number;
      eighteenArhatsCount?: number;
      noFlowersCount?: number;
    };
    lami?: {
      totalGamesPlayed: number;
      totalWins: number;
      currentWinStreak?: number;
      highestWinStreak?: number;
      highestCoinWin?: number;
      highestCoinLose?: number;
      gamesWonByClear?: number;
      gamesWonByPoints?: number;
      brotherhood1st?: number;
      brotherhood2nd?: number;
      brotherhood3rd?: number;
      burntCount?: number;
      lucky7CardCount?: number;
      fourAcesCount?: number;
      jokerRounds?: number;
      totalDeadwoodPoints?: number;
      deadwoodGamesCount?: number;
      totalCoinsGained?: number;
      totalCoinsLost?: number;
    };
    dizhu?: {
      totalGamesPlayed: number;
      totalWins: number;
      currentWinStreak?: number;
      highestWinStreak?: number;
      highestCoinWin?: number;
      highestCoinLose?: number;
      totalCoinsGained?: number;
      totalCoinsLost?: number;
      landlordGames?: number;
      landlordWins?: number;
      farmerGames?: number;
      farmerWins?: number;
      landlordChoiceAttempts?: number;
      maxBombsSingleGame?: number;
      rocketCount?: number;
      highestMultiplier?: number;
      springCount?: number;
      antiSpringCount?: number;
      lostGamesCount?: number;
      remainingCardsLostSum?: number;
      airplaneCount?: number;
      tripleOneCount?: number;
      triplePairCount?: number;
      quadTwoCount?: number;
      bombPlayedCount?: number;
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private profileUnsubscribe?: Unsubscribe;

  private userProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  userProfile$ = this.userProfileSubject.asObservable();
  
  get currentProfile(): UserProfile | null {
    return this.userProfileSubject.value;
  }

  public currentUser: User | null = null;

  constructor() {
    // Process any returning Google Redirects
    getRedirectResult(this.auth).catch(err => console.error('Redirect result error', err));

    authState(this.auth).subscribe((user: User | null) => {
      this.currentUser = user;
      if (user) {
        this.loadUserProfile(user);
      } else {
        this.userProfileSubject.next(null);
      }
    });
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(this.auth, provider);
    if (result && result.user) {
      this.currentUser = result.user;
      await this.loadUserProfile(result.user);
    }
  }

  async loginAsGuest() {
    return signInAnonymously(this.auth);
  }

  async logout() {
    if (this.profileUnsubscribe) {
      this.profileUnsubscribe();
      this.profileUnsubscribe = undefined;
    }
    return signOut(this.auth);
  }

  private async loadUserProfile(user: User) {
    // Eagerly emit a basic profile so the UI isn't blocked if Firestore hangs
    const basicProfile: UserProfile = {
      uid: user.uid,
      name: user.displayName || (user.isAnonymous ? `Guest_${user.uid.substring(0, 5)}` : 'Player'),
      email: user.email,
      avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
      coins: 10000,
      stats: { 
        mahjong: { totalGamesPlayed: 0, totalWins: 0, totalFanWon: 0 },
        lami: { totalGamesPlayed: 0, totalWins: 0 },
        dizhu: { totalGamesPlayed: 0, totalWins: 0 }
      }
    };
    
    // Only emit eagerly if we don't already have one, to avoid flashing
    if (!this.userProfileSubject.value) {
      this.userProfileSubject.next(basicProfile);
    }

    try {
      // Add a simple timeout wrapper to prevent hanging forever
      const userDocRef = doc(this.firestore, `users/${user.uid}`);
      
      // Ensure the document exists first
      const docSnap = await getDoc(userDocRef);
      if (!docSnap.exists()) {
        await setDoc(userDocRef, basicProfile);
      }

      // Listen for real-time updates
      this.profileUnsubscribe = onSnapshot(userDocRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as any;
          // Migrate old flat stats format if it exists
          if (data.stats && typeof data.stats.totalGamesPlayed === 'number') {
            data.stats = {
              mahjong: { ...data.stats },
              lami: { totalGamesPlayed: 0, totalWins: 0 }
            };
            updateDoc(userDocRef, { stats: data.stats }).catch(e => console.error('Migration failed', e));
          }
          if (!data.stats) {
            data.stats = basicProfile.stats;
          }
          this.userProfileSubject.next(data as UserProfile);
        }
      });
    } catch (error) {
      console.error('Error loading user profile from Firestore:', error);
      // We already emitted the basic profile, so we can just leave it as is
    }
  }

  async updateUserName(newName: string) {
    if (this.currentUser && newName.trim()) {
      try {
        const userDocRef = doc(this.firestore, `users/${this.currentUser.uid}`);
        await updateDoc(userDocRef, { name: newName.trim() });
        const currentProfile = this.userProfileSubject.value;
        if (currentProfile) {
          this.userProfileSubject.next({ ...currentProfile, name: newName.trim() });
        }
      } catch (error) {
        console.error('Error updating user name:', error);
      }
    }
  }

  async getToken(): Promise<string | null> {
    if (this.currentUser) {
      return this.currentUser.getIdToken();
    }
    return null;
  }
}
