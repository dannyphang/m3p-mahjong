import { Injectable, inject } from '@angular/core';
import { Auth, authState, signInAnonymously, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, User, getRedirectResult } from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc, updateDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  avatar: string;
  coins: number;
  stats: {
    totalGamesPlayed: number;
    totalWins: number;
    totalFanWon: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);

  private userProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  userProfile$ = this.userProfileSubject.asObservable();
  
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
    await signInWithRedirect(this.auth, provider);
  }

  async loginAsGuest() {
    return signInAnonymously(this.auth);
  }

  async logout() {
    return signOut(this.auth);
  }

  private async loadUserProfile(user: User) {
    const userDocRef = doc(this.firestore, `users/${user.uid}`);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      this.userProfileSubject.next(docSnap.data() as UserProfile);
    } else {
      // Create new user profile
      const newProfile: UserProfile = {
        uid: user.uid,
        name: user.displayName || (user.isAnonymous ? `Guest_${user.uid.substring(0, 5)}` : 'Player'),
        email: user.email,
        avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        coins: 10000,
        stats: {
          totalGamesPlayed: 0,
          totalWins: 0,
          totalFanWon: 0
        }
      };

      await setDoc(userDocRef, newProfile);
      this.userProfileSubject.next(newProfile);
    }
  }

  async getToken(): Promise<string | null> {
    if (this.currentUser) {
      return this.currentUser.getIdToken();
    }
    return null;
  }
}
